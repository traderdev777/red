-- Library: a per-user index of findings across scans, and the user's own
-- status for each (open / done / dismissed). Idempotent.

-------------------------------------------------------------------------------
-- scan_findings: written by the scanner (service role) when a scan completes
-------------------------------------------------------------------------------

create table if not exists public.scan_findings (
  scan_id        uuid not null references public.scans (id) on delete cascade,
  finding_id     text not null,
  user_id        uuid not null references auth.users (id) on delete cascade,
  url_hash       text not null,
  normalized_url text not null,
  category       text not null,
  severity       text not null,
  kind           text not null,
  score          integer not null,
  title          text not null,
  actions        integer not null default 0,
  created_at     timestamptz not null default now(),
  primary key (scan_id, finding_id),
  constraint scan_findings_severity_check check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  constraint scan_findings_kind_check check (kind in ('detected', 'inferred', 'risk')),
  constraint scan_findings_title_len check (char_length(title) <= 200 and char_length(finding_id) <= 120)
);

create index if not exists scan_findings_user_site_idx on public.scan_findings (user_id, url_hash, created_at desc);

alter table public.scan_findings enable row level security;
revoke all on table public.scan_findings from anon, authenticated;
grant select on table public.scan_findings to authenticated;

drop policy if exists "scan_findings: read own" on public.scan_findings;
create policy "scan_findings: read own"
  on public.scan_findings for select
  to authenticated
  using (user_id = (select auth.uid()));

-- A cached scan reuses another scan's result; give it the same findings rows
-- under the new owner so the Library sees them.
create or replace function public.scans_copy_findings_for_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cached_from is not null and new.status = 'done' then
    insert into public.scan_findings (scan_id, finding_id, user_id, url_hash, normalized_url, category, severity, kind, score, title, actions)
    select new.id, f.finding_id, new.user_id, f.url_hash, f.normalized_url, f.category, f.severity, f.kind, f.score, f.title, f.actions
      from public.scan_findings f
     where f.scan_id = new.cached_from
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists scans_copy_findings_for_cache on public.scans;
create trigger scans_copy_findings_for_cache
  after insert on public.scans
  for each row execute function public.scans_copy_findings_for_cache();

-------------------------------------------------------------------------------
-- finding_status: the user's own triage, keyed by site + finding id so a
-- "done" survives a re-scan (and the Library can show if it is still detected)
-------------------------------------------------------------------------------

create table if not exists public.finding_status (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url_hash   text not null,
  finding_id text not null,
  status     text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, url_hash, finding_id),
  constraint finding_status_status_check check (status in ('open', 'done', 'dismissed')),
  constraint finding_status_hash_format check (url_hash ~ '^[0-9a-f]{64}$'),
  constraint finding_status_id_len check (char_length(finding_id) between 1 and 120)
);

alter table public.finding_status enable row level security;
revoke all on table public.finding_status from anon, authenticated;
grant select, delete on table public.finding_status to authenticated;
grant insert (url_hash, finding_id, status) on table public.finding_status to authenticated;
grant update (status, updated_at) on table public.finding_status to authenticated;

drop policy if exists "finding_status: own" on public.finding_status;
create policy "finding_status: own"
  on public.finding_status for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- index_scan_findings: scanner writes the index in one call (service role)
-------------------------------------------------------------------------------

create or replace function public.index_scan_findings(p_scan_id uuid, p_findings jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.scans;
  v_count integer;
begin
  if not public.red_is_privileged() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  select * into v_scan from public.scans where id = p_scan_id;
  if not found then
    return 0;
  end if;
  delete from public.scan_findings where scan_id = p_scan_id;
  insert into public.scan_findings (scan_id, finding_id, user_id, url_hash, normalized_url, category, severity, kind, score, title, actions)
  select p_scan_id, f->>'id', v_scan.user_id, v_scan.url_hash, v_scan.normalized_url,
         f->>'category', f->>'severity', f->>'kind', (f->>'score')::int, left(f->>'title', 200), coalesce((f->>'actions')::int, 0)
    from jsonb_array_elements(p_findings) f;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.index_scan_findings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.index_scan_findings(uuid, jsonb) to service_role;
revoke all on function public.scans_copy_findings_for_cache() from public, anon, authenticated;
