-- RLS & integrity tests. Each check raises on failure (ON_ERROR_STOP aborts the run).
\set ON_ERROR_STOP 1
\set QUIET 1

-- Two users created the way Supabase Auth would (trigger bootstraps profile/rules/subscription)
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test', '{"full_name":"Alex A"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test', '{"full_name":"Bo B"}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profiles bootstrapped';
  assert (select count(*) from public.work_rules) = 2, 'work_rules bootstrapped';
  assert (select count(*) from public.subscriptions where plan = 'free') = 2, 'free subscriptions bootstrapped';
  assert (select full_name from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 'Alex A';
end $$;

-- ===================== act as user A =====================
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);

insert into public.employers (id, user_id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sparky Co');
insert into public.job_sites (id, user_id, employer_id, name, latitude, longitude) values
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a0000000-0000-0000-0000-000000000001', 'Westmead Residential', -33.8, 150.98);
insert into public.work_sessions (id, user_id, employer_id, job_site_id, started_at, ended_at, start_location_source) values
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   now() - interval '9 hours', now() - interval '1 hour', 'gps');
insert into public.breaks (user_id, session_id, started_at, ended_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000003',
   now() - interval '5 hours', now() - interval '4 hours 30 minutes');

-- A can see their own data
do $$ begin
  assert (select count(*) from public.work_sessions) = 1, 'A sees own session';
  assert (select status from public.work_sessions) = 'completed', 'generated status';
  assert (select count(*) from public.profiles) = 1, 'A sees only own profile';
  assert (select session_count from public.job_site_stats()) = 1, 'job_site_stats counts';
  assert (select worked_minutes from public.job_site_stats()) = 450, 'job_site_stats deducts unpaid break (480-30)';
end $$;

-- One active clock-in per user, enforced by the database
insert into public.work_sessions (user_id, started_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '20 hours');
do $$ begin
  begin
    insert into public.work_sessions (user_id, started_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now());
    raise exception 'FAIL: second active session allowed';
  exception when unique_violation then null;
  end;
end $$;

-- Invalid times rejected
do $$ begin
  begin
    insert into public.work_sessions (user_id, started_at, ended_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now() - interval '1 hour');
    raise exception 'FAIL: end before start allowed';
  exception when check_violation then null;
  end;
end $$;

-- Audit trail: editing a session records before/after
update public.work_sessions set ended_at = ended_at + interval '15 minutes', change_reason = 'Forgot to clock out'
where id = 'a0000000-0000-0000-0000-000000000003';
update public.work_sessions set notes = 'n', approval_status = 'submitted'
where id = 'a0000000-0000-0000-0000-000000000003';
do $$ begin
  assert (select reason from public.timesheet_adjustments where changes ? 'ended_at') = 'Forgot to clock out', 'reason recorded';
  assert (select reason from public.timesheet_adjustments where changes ? 'approval_status') is null, 'reason not reused';
  assert (select change_reason from public.work_sessions where id = 'a0000000-0000-0000-0000-000000000003') is null, 'reason not stored on row';
end $$;
do $$ begin
  assert (select count(*) from public.timesheet_adjustments where action = 'update'
          and changes ? 'ended_at') = 1, 'audit row written for update';
  begin
    insert into public.timesheet_adjustments (user_id, action, changes)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'update', '{}');
    raise exception 'FAIL: client could forge audit rows';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Forgotten clock-out notification (active session is 20h old)
do $$ begin
  assert public.refresh_notifications() >= 1, 'refresh_notifications inserted';
  assert (select count(*) from public.notifications where kind = 'forgotten_clock_out') = 1, 'forgot notif';
  perform public.refresh_notifications();
  assert (select count(*) from public.notifications where kind = 'forgotten_clock_out') = 1, 'dedupe works';
end $$;

-- Subscriptions are read-only to the client
do $$ begin
  update public.subscriptions set plan = 'pro';
  assert (select plan from public.subscriptions) = 'free', 'FAIL: client upgraded own plan';
end $$;

-- AI quota
do $$ begin
  assert public.consume_ai_quota(2) = true;
  assert public.consume_ai_quota(2) = true;
  assert public.consume_ai_quota(2) = false, 'quota enforced';
end $$;

-- Diary + full-text search
insert into public.work_diary_entries (id, user_id, entry_date, description, tasks, skills)
values ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date,
        'Installed four double power points and ran cable through the roof space',
        array['Ran TPS cable'], array['Cable installation']);
do $$ begin
  assert (select count(*) from public.work_diary_entries where search @@ plainto_tsquery('english', 'power points')) = 1, 'fts';
end $$;

-- Storage: own folder ok, other folder rejected
insert into storage.objects (bucket_id, name) values ('user-files', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/diary/x.jpg');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('user-files', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/diary/x.jpg');
    raise exception 'FAIL: wrote into another user''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ===================== act as user B =====================
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);

do $$ begin
  assert (select count(*) from public.work_sessions) = 0, 'B cannot see A sessions';
  assert (select count(*) from public.employers) = 0, 'B cannot see A employers';
  assert (select count(*) from public.work_diary_entries) = 0, 'B cannot see A diary';
  assert (select count(*) from public.breaks) = 0, 'B cannot see A breaks';
  assert (select count(*) from public.timesheet_adjustments) = 0, 'B cannot see A audit';
  assert (select count(*) from public.notifications) = 0, 'B cannot see A notifications';
  assert (select count(*) from public.job_site_stats()) = 0, 'B stats empty';
  assert (select count(*) from storage.objects) = 0, 'B cannot list A files';
end $$;

-- B cannot modify or delete A's rows (silently affects 0 rows under RLS)
do $$
declare n integer;
begin
  update public.work_sessions set notes = 'hacked' where id = 'a0000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count; assert n = 0, 'B update blocked';
  delete from public.employers where id = 'a0000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count; assert n = 0, 'B delete blocked';
end $$;

-- B cannot insert rows owned by A
do $$ begin
  begin
    insert into public.employers (user_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Evil');
    raise exception 'FAIL: B inserted row as A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B cannot attach own rows to A's records (composite FK blocks cross-user references)
do $$ begin
  begin
    insert into public.work_sessions (user_id, started_at, job_site_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), 'a0000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: B referenced A job site';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.diary_photos (user_id, entry_id, storage_path, mime_type, size_bytes)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a0000000-0000-0000-0000-000000000004',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/diary/y.jpg', 'image/jpeg', 100);
    raise exception 'FAIL: B attached photo to A diary';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Stored file paths must sit in the owner's folder
do $$ begin
  begin
    insert into public.documents (user_id, title, storage_path, mime_type, size_bytes)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'x', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/documents/a.pdf', 'application/pdf', 10);
    raise exception 'FAIL: B stored path into A folder';
  exception when check_violation then null;
  end;
end $$;

-- B's own clock-in works independently of A's active session
insert into public.work_sessions (user_id, started_at) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now());

-- ===================== anon =====================
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.work_sessions;
    raise exception 'FAIL: anon can read work_sessions';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Account deletion cascades everything
delete from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$ begin
  assert (select count(*) from public.work_sessions where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0, 'cascade sessions';
  assert (select count(*) from public.timesheet_adjustments where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0, 'cascade audit';
  assert (select count(*) from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0, 'cascade profile';
end $$;

\echo 'ALL DB TESTS PASSED'
