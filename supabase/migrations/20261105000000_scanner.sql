-- RED scanner queue: claim, heartbeat, progress, completion, failure, reaper.
-- Idempotent: safe to run more than once. Requires 20261104000000_app_core.sql.
--
-- Every function here is SECURITY DEFINER and callable by the service role only.
-- Users keep the access app_core gave them (read own scans, insert queued scans).

-------------------------------------------------------------------------------
-- Columns the worker owns
-------------------------------------------------------------------------------

alter table public.scans add column if not exists started_at   timestamptz;
alter table public.scans add column if not exists heartbeat_at timestamptz;
alter table public.scans add column if not exists worker_id    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scans_worker_id_len') then
    alter table public.scans add constraint scans_worker_id_len check (worker_id is null or char_length(worker_id) <= 128);
  end if;
end;
$$;

-- Queue scan: oldest queued first. Partial so it stays tiny.
create index if not exists scans_queue_idx on public.scans (created_at) where status = 'queued';
-- Reaper scan.
create index if not exists scans_active_idx on public.scans (started_at) where status in ('collecting', 'analyzing');

-- Users never see worker bookkeeping change through their own grants: they have
-- SELECT on the row (so the UI can show started_at) but no UPDATE at all.

-------------------------------------------------------------------------------
-- Audit: the scanner logs SSRF blocks and bot walls
-------------------------------------------------------------------------------

alter table public.scan_audit drop constraint if exists scan_audit_event_check;
alter table public.scan_audit add constraint scan_audit_event_check check (event in (
  'scan.created', 'scan.cached', 'scan.retried', 'scan.rejected',
  'scan.blocked_ssrf', 'scan.blocked_bot_wall', 'scan.reaped'
));
alter table public.scan_audit add column if not exists detail jsonb;

-------------------------------------------------------------------------------
-- claim_next_scan: one queued scan per call, never the same one twice
-------------------------------------------------------------------------------

create or replace function public.claim_next_scan(p_worker_id text)
returns setof public.scans
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.red_is_privileged() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  if p_worker_id is null or char_length(p_worker_id) = 0 then
    raise exception 'worker id required' using errcode = '22023';
  end if;

  return query
  with next as (
    select s.id
      from public.scans s
     where s.status = 'queued'
     order by s.created_at
     for update skip locked
     limit 1
  )
  update public.scans s
     set status       = 'collecting',
         progress     = 0,
         started_at   = now(),
         heartbeat_at = now(),
         worker_id    = p_worker_id,
         error        = null
    from next
   where s.id = next.id
  returning s.*;
end;
$$;

-------------------------------------------------------------------------------
-- Progress: monotonic, and only from the worker that holds the scan
-------------------------------------------------------------------------------

create or replace function public.update_scan_progress(
  p_scan_id uuid,
  p_worker_id text,
  p_progress integer,
  p_status text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not public.red_is_privileged() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('collecting', 'analyzing') then
    raise exception 'progress updates may only set collecting or analyzing' using errcode = '22023';
  end if;

  update public.scans s
     set progress     = greatest(s.progress, least(greatest(p_progress, 0), 99)),
         status       = coalesce(p_status, s.status),
         heartbeat_at = now()
   where s.id = p_scan_id
     and s.worker_id = p_worker_id
     and s.status in ('collecting', 'analyzing');
  get diagnostics v_rows = row_count;
  -- false tells the worker it lost the scan (reaped or finished elsewhere): stop.
  return v_rows = 1;
end;
$$;

-------------------------------------------------------------------------------
-- complete_scan: done, progress 100, compact result
-------------------------------------------------------------------------------

create or replace function public.complete_scan(p_scan_id uuid, p_worker_id text, p_result jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not public.red_is_privileged() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  update public.scans s
     set status       = 'done',
         progress     = 100,
         result       = p_result,
         error        = null,
         failed_stage = null,
         finished_at  = now(),
         heartbeat_at = now()
   where s.id = p_scan_id
     and s.worker_id = p_worker_id
     and s.status in ('collecting', 'analyzing');
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-------------------------------------------------------------------------------
-- Failure + refund. A scan that fails before analysis gives its quota back.
-------------------------------------------------------------------------------

-- Internal helper; not granted to anyone.
create or replace function public._red_fail_scan(p_scan public.scans, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text := case when p_scan.status = 'analyzing' then 'analyzing' else 'collecting' end;
  v_refund boolean := p_scan.quota_charged and v_stage <> 'analyzing';
begin
  update public.scans s
     set status        = 'failed',
         error         = left(coalesce(p_error, 'Scan failed'), 500),
         failed_stage  = v_stage,
         finished_at   = now(),
         quota_charged = case when v_refund then false else s.quota_charged end
   where s.id = p_scan.id;

  if v_refund then
    update public.scan_usage su
       set count = greatest(su.count - 1, 0)
     where su.user_id = p_scan.user_id
       and su.day = (p_scan.created_at at time zone 'utc')::date;
  end if;
end;
$$;

create or replace function public.fail_scan(p_scan_id uuid, p_worker_id text, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.scans;
begin
  if not public.red_is_privileged() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  select * into v_scan
    from public.scans s
   where s.id = p_scan_id
     and s.worker_id = p_worker_id
     and s.status in ('collecting', 'analyzing')
   for update;
  if not found then
    return false;
  end if;
  perform public._red_fail_scan(v_scan, p_error);
  return true;
end;
$$;

-------------------------------------------------------------------------------
-- Reaper: anything active longer than the timeout is failed and refunded
-------------------------------------------------------------------------------

create or replace function public.reap_stuck_scans(p_timeout_seconds integer default 300)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.scans;
begin
  if not public.red_is_privileged() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  for v_scan in
    select *
      from public.scans s
     where s.status in ('collecting', 'analyzing')
       and s.started_at < now() - make_interval(secs => greatest(p_timeout_seconds, 60))
     for update skip locked
  loop
    perform public._red_fail_scan(v_scan, 'Scanner timed out');
    insert into public.scan_audit (user_id, scan_id, event, url_hash, detail)
    values (v_scan.user_id, v_scan.id, 'scan.reaped', v_scan.url_hash,
            jsonb_build_object('worker_id', v_scan.worker_id, 'started_at', v_scan.started_at));
    return next v_scan.id;
  end loop;
end;
$$;

-------------------------------------------------------------------------------
-- Health: queue depth for /health
-------------------------------------------------------------------------------

create or replace function public.scan_queue_stats()
returns table (queued bigint, active bigint, oldest_queued_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where status = 'queued'),
         count(*) filter (where status in ('collecting', 'analyzing')),
         min(created_at) filter (where status = 'queued')
    from public.scans
   where status in ('queued', 'collecting', 'analyzing')
     and public.red_is_privileged();
$$;

-------------------------------------------------------------------------------
-- Grants: service role only
-------------------------------------------------------------------------------

revoke all on function public.claim_next_scan(text) from public, anon, authenticated;
revoke all on function public.update_scan_progress(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.complete_scan(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public._red_fail_scan(public.scans, text) from public, anon, authenticated, service_role;
revoke all on function public.fail_scan(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reap_stuck_scans(integer) from public, anon, authenticated;
revoke all on function public.scan_queue_stats() from public, anon, authenticated;

grant execute on function public.claim_next_scan(text) to service_role;
grant execute on function public.update_scan_progress(uuid, text, integer, text) to service_role;
grant execute on function public.complete_scan(uuid, text, jsonb) to service_role;
grant execute on function public.fail_scan(uuid, text, text) to service_role;
grant execute on function public.reap_stuck_scans(integer) to service_role;
grant execute on function public.scan_queue_stats() to service_role;

-------------------------------------------------------------------------------
-- Storage: private bucket for evidence (no policies = no user access;
-- the app reads through short-lived signed URLs minted server-side)
-------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('evidence', 'evidence', false, 6291456, array['application/json', 'image/jpeg', 'image/png'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;
