-- Apprentice OS — a change reason applies to exactly one edit.
-- Before: change_reason stayed on the row, so a later edit without a reason could
-- inherit the previous one in the audit trail.
-- After: a BEFORE trigger moves the reason into a transaction-local setting and clears
-- the column; the audit trigger reads it from there.

create or replace function public.take_change_reason()
returns trigger
language plpgsql
as $$
begin
  perform set_config('aos.change_reason', coalesce(new.change_reason, ''), true);
  new.change_reason := null;
  return new;
end;
$$;

drop trigger if exists work_sessions_take_reason on public.work_sessions;
create trigger work_sessions_take_reason
before update on public.work_sessions
for each row execute function public.take_change_reason();

create or replace function public.audit_work_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tracked text[] := array['started_at','ended_at','employer_id','job_site_id','approval_status',
                          'start_address','end_address','start_latitude','end_latitude'];
  diff jsonb := '{}'::jsonb;
  col text;
  old_j jsonb;
  new_j jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.timesheet_adjustments (user_id, session_id, action, changes)
    values (new.user_id, new.id, 'insert',
      jsonb_build_object('started_at', new.started_at, 'source', new.source));
    return new;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from auth.users u where u.id = old.user_id) then
      return old;
    end if;
    insert into public.timesheet_adjustments (user_id, session_id, action, changes)
    values (old.user_id, null, 'delete',
      jsonb_build_object('session_id', old.id, 'started_at', old.started_at, 'ended_at', old.ended_at));
    return old;
  end if;

  old_j := to_jsonb(old);
  new_j := to_jsonb(new);
  foreach col in array tracked loop
    if old_j -> col is distinct from new_j -> col then
      diff := diff || jsonb_build_object(col, jsonb_build_object('from', old_j -> col, 'to', new_j -> col));
    end if;
  end loop;

  if diff <> '{}'::jsonb then
    insert into public.timesheet_adjustments (user_id, session_id, action, changes, reason)
    values (new.user_id, new.id, 'update', diff, nullif(current_setting('aos.change_reason', true), ''));
  end if;
  return new;
end;
$$;

-- Clear any reason left on existing rows by the previous behaviour.
update public.work_sessions set change_reason = null where change_reason is not null;
