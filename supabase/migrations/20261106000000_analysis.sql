-- Analysis phase: progress restarts at 0 when a scan moves from collecting to
-- analyzing, so each phase reports its own real milestones. Idempotent.

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
  v_p integer := least(greatest(p_progress, 0), 99);
begin
  if not public.red_is_privileged() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('collecting', 'analyzing') then
    raise exception 'progress updates may only set collecting or analyzing' using errcode = '22023';
  end if;

  update public.scans s
     set progress     = case
                          -- Entering a new phase: start that phase's bar from the reported value.
                          when p_status is not null and p_status <> s.status then v_p
                          else greatest(s.progress, v_p)
                        end,
         status       = coalesce(p_status, s.status),
         heartbeat_at = now()
   where s.id = p_scan_id
     and s.worker_id = p_worker_id
     and s.status in ('collecting', 'analyzing')
     -- Never move backwards from analyzing to collecting.
     and not (s.status = 'analyzing' and coalesce(p_status, '') = 'collecting');
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.update_scan_progress(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.update_scan_progress(uuid, text, integer, text) to service_role;
