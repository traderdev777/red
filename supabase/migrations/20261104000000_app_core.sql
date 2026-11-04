-- RED app core: profiles, scans, scan_usage, scan_audit, quota functions, RLS, Realtime.
-- Idempotent: safe to run more than once (CREATE ... IF NOT EXISTS, CREATE OR REPLACE,
-- DROP ... IF EXISTS before CREATE for policies and triggers).
--
-- Trust model
--   anon            nothing in these tables.
--   authenticated   reads own profile, own scans, own usage. Inserts own scans, but a
--                   trigger forces them to 'queued' and charges quota, so the REST API
--                   is never a way around the daily limit. No UPDATE or DELETE at all.
--   service_role    everything (the scanner writes status/progress/result; the app's
--                   server actions insert cache hits and audit rows).
--   SQL editor      (session user postgres) may set role/limits. That is the only
--                   place an owner is made.

create extension if not exists citext;

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------

-- True when the caller is the service role (PostgREST JWT role claim) or an
-- operator connected directly as postgres / supabase_admin (SQL editor, psql).
create or replace function public.red_is_privileged()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin');
$$;

-------------------------------------------------------------------------------
-- profiles
-------------------------------------------------------------------------------

create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text,
  role             text not null default 'user',
  daily_scan_limit integer not null default 5,
  created_at       timestamptz not null default now(),
  constraint profiles_role_check check (role in ('user', 'owner')),
  constraint profiles_limit_check check (daily_scan_limit between 0 and 10000)
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policy for users. The guard below is defense in depth
-- in case a future policy or grant opens UPDATE by mistake.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.red_is_privileged()
     and (new.role is distinct from old.role
          or new.daily_scan_limit is distinct from old.daily_scan_limit
          or new.id is distinct from old.id) then
    raise exception 'role and daily_scan_limit can only be changed by an operator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- New auth user -> profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in step when a user changes their address.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Backfill users created before this migration.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

-------------------------------------------------------------------------------
-- scans
-------------------------------------------------------------------------------

create table if not exists public.scans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url            text not null,
  normalized_url text not null,
  url_hash       text not null,
  status         text not null default 'queued',
  progress       integer not null default 0,
  error          text,
  result         jsonb,
  cached_from    uuid references public.scans (id) on delete set null,
  -- Bookkeeping for quota and retries (written by the server, never by users).
  quota_charged  boolean not null default false,
  failed_stage   text,
  retry_of       uuid references public.scans (id) on delete set null,
  attempt        integer not null default 1,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz,
  constraint scans_status_check check (status in ('queued', 'collecting', 'analyzing', 'done', 'failed')),
  constraint scans_progress_check check (progress between 0 and 100),
  constraint scans_url_len check (char_length(url) <= 2048 and char_length(normalized_url) <= 2048),
  constraint scans_hash_format check (url_hash ~ '^[0-9a-f]{64}$'),
  constraint scans_failed_stage_check check (failed_stage is null or failed_stage in ('queued', 'collecting', 'analyzing')),
  constraint scans_attempt_check check (attempt between 1 and 100)
);

create index if not exists scans_url_hash_idx on public.scans (url_hash);
create index if not exists scans_user_created_idx on public.scans (user_id, created_at desc);
-- Cache lookups: newest finished scan for a URL.
create index if not exists scans_cache_idx on public.scans (url_hash, finished_at desc) where status = 'done';
-- A failed scan can be retried once; the retry carries the chain forward.
create unique index if not exists scans_retry_of_key on public.scans (retry_of) where retry_of is not null;

alter table public.scans enable row level security;

revoke all on table public.scans from anon, authenticated;
grant select on table public.scans to authenticated;
grant insert (url, normalized_url, url_hash) on table public.scans to authenticated;

drop policy if exists "scans: read own" on public.scans;
create policy "scans: read own"
  on public.scans for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "scans: insert own" on public.scans;
create policy "scans: insert own"
  on public.scans for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Users may insert, but only a fresh queued scan, and it costs quota. The app
-- itself inserts through the service role after its own checks, so this path
-- only matters for direct API use.
create or replace function public.scans_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
begin
  if public.red_is_privileged() then
    return new;
  end if;

  new.user_id       := auth.uid();
  new.status        := 'queued';
  new.progress      := 0;
  new.error         := null;
  new.result        := null;
  new.cached_from   := null;
  new.failed_stage  := null;
  new.retry_of      := null;
  new.attempt       := 1;
  new.created_at    := now();
  new.finished_at   := null;

  select * into q from public.consume_scan_quota(new.user_id);
  if not q.allowed then
    raise exception 'daily scan limit reached (% of %)', q.used, q.quota_limit
      using errcode = 'P0001', hint = 'quota_exceeded';
  end if;
  new.quota_charged := not q.is_owner;
  return new;
end;
$$;

drop trigger if exists scans_before_insert on public.scans;
create trigger scans_before_insert
  before insert on public.scans
  for each row execute function public.scans_before_insert();

-------------------------------------------------------------------------------
-- scan_usage + quota
-------------------------------------------------------------------------------

create table if not exists public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day),
  constraint scan_usage_count_check check (count >= 0)
);

alter table public.scan_usage enable row level security;

revoke all on table public.scan_usage from anon, authenticated;
grant select on table public.scan_usage to authenticated;

drop policy if exists "scan_usage: read own" on public.scan_usage;
create policy "scan_usage: read own"
  on public.scan_usage for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Quota day boundary is UTC midnight (05:30 IST).
--
-- Race safety: the increment is a single INSERT ... ON CONFLICT DO UPDATE ... WHERE
-- count < limit. Postgres takes the row lock for the conflicting row, re-evaluates
-- the WHERE against the latest version, and either increments or does nothing.
-- Concurrent callers serialize on that row, so at most `limit` calls succeed.
create or replace function public.consume_scan_quota(p_user_id uuid)
returns table (allowed boolean, used integer, quota_limit integer, is_owner boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role  text;
  v_limit integer;
  v_count integer;
  v_day   date := (now() at time zone 'utc')::date;
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22004';
  end if;
  if not public.red_is_privileged() and p_user_id is distinct from auth.uid() then
    raise exception 'cannot consume quota for another user' using errcode = '42501';
  end if;

  select p.role, p.daily_scan_limit into v_role, v_limit
  from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if v_role = 'owner' then
    return query select true, 0, null::integer, true;
    return;
  end if;

  if v_limit <= 0 then
    select coalesce((select su.count from public.scan_usage su where su.user_id = p_user_id and su.day = v_day), 0)
      into v_count;
    return query select false, v_count, v_limit, false;
    return;
  end if;

  insert into public.scan_usage as su (user_id, day, count)
  values (p_user_id, v_day, 1)
  on conflict (user_id, day) do update
    set count = su.count + 1
    where su.count < v_limit
  returning su.count into v_count;

  if v_count is null then
    -- Conflict row exists and is already at the limit: nothing was written.
    select su.count into v_count from public.scan_usage su where su.user_id = p_user_id and su.day = v_day;
    return query select false, v_count, v_limit, false;
    return;
  end if;

  return query select true, v_count, v_limit, false;
end;
$$;

-- Gives back one unit when a charged scan could not be created, or when the
-- scanner fails before analysis. Service role only.
create or replace function public.release_scan_quota(p_user_id uuid, p_day date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.red_is_privileged() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  update public.scan_usage su
     set count = greatest(su.count - 1, 0)
   where su.user_id = p_user_id
     and su.day = coalesce(p_day, (now() at time zone 'utc')::date)
  returning su.count into v_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.consume_scan_quota(uuid) from public, anon;
grant execute on function public.consume_scan_quota(uuid) to authenticated, service_role;
revoke all on function public.release_scan_quota(uuid, date) from public, anon, authenticated;
grant execute on function public.release_scan_quota(uuid, date) to service_role;
revoke all on function public.red_is_privileged() from public, anon;
grant execute on function public.red_is_privileged() to authenticated, service_role;

-------------------------------------------------------------------------------
-- scan_audit (service role only; no policies = no access for users)
-------------------------------------------------------------------------------

create table if not exists public.scan_audit (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  scan_id    uuid references public.scans (id) on delete set null,
  event      text not null,
  url_hash   text not null,
  ip_hash    text,
  created_at timestamptz not null default now(),
  constraint scan_audit_event_check check (event in ('scan.created', 'scan.cached', 'scan.retried', 'scan.rejected'))
);

create index if not exists scan_audit_user_created_idx on public.scan_audit (user_id, created_at desc);

alter table public.scan_audit enable row level security;
revoke all on table public.scan_audit from anon, authenticated;

-------------------------------------------------------------------------------
-- Realtime
-------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scans'
     ) then
    alter publication supabase_realtime add table public.scans;
  end if;
end;
$$;
