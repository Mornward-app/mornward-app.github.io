-- Mornward: check a database after the migrations (004 → 005 → 006).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. It shows one table: every row should say PASS.
-- It adds a few rows as the app would (as the public "anon" role), checks what the database accepts and refuses,
-- then deletes every row it added. Nothing else is changed. Safe to run more than once, on a test project or on
-- production.

create temp table if not exists mw_check (n int, what text, result text);
truncate mw_check;

do $$
declare
  dev  uuid := 'aaaaaaaa-0000-4000-8000-00000000c0de';   -- the check's own device id (removed again at the end)
  ok   boolean;
  rows int;
  rid  text := 'c0dec0de';
begin
  -- 1. The new app's rows are accepted, sent the way the app sends them
  begin
    set local role anon;
    insert into public.events (event_id, device_id, day, kind, data, app_version) values
      (gen_random_uuid(), dev, current_date, 'setup_started',          '{"run":0,"test":true}', 'beta-5'),
      (gen_random_uuid(), dev, current_date, 'setup_completed',        '{"run":0,"tasks_prepared":2,"test":true}', 'beta-5'),
      (gen_random_uuid(), dev, current_date, 'routine_started',        jsonb_build_object('run',1,'rid',rid,'first',true,'test',true), 'beta-5'),
      (gen_random_uuid(), dev, current_date, 'breathing_completed',    jsonb_build_object('run',1,'rid',rid,'test',true), 'beta-5'),
      (gen_random_uuid(), dev, current_date, 'tasks_saved',            jsonb_build_object('run',1,'rid',rid,'count',2,'kept_defaults',false,'prepared',true,'own',false,'test',true), 'beta-5'),
      (gen_random_uuid(), dev, current_date, 'routine_finished',       jsonb_build_object('run',1,'rid',rid,'breathing','completed','tasks','saved','core',true,'def',2,'seconds',70,'test',true), 'beta-5'),
      (gen_random_uuid(), dev, current_date, 'core_routine_completed', jsonb_build_object('run',1,'rid',rid,'def',2,'test',true), 'beta-5'),
      (gen_random_uuid(), dev, current_date, 'reminder_setup',         '{"run":0,"action":"google_link","test":true}', 'beta-5');
    reset role;
    insert into mw_check values (1, 'The new app''s rows are accepted (setup, routine, tasks, reminder)', 'PASS');
  exception when others then
    reset role;
    insert into mw_check values (1, 'The new app''s rows are accepted (setup, routine, tasks, reminder)', 'FAIL: ' || sqlerrm);
  end;

  -- 2. The old app (beta-2, live until the merge) still works
  begin
    set local role anon;
    insert into public.events (device_id, day, kind, data, app_version) values (dev, current_date, 'morning_start', '{"test":true}', 'beta-2');
    reset role;
    insert into mw_check values (2, 'The old app''s rows are still accepted', 'PASS');
  exception when others then
    reset role;
    insert into mw_check values (2, 'The old app''s rows are still accepted', 'FAIL: ' || sqlerrm);
  end;

  -- 3. Written words are refused (task text must never be stored)
  begin
    set local role anon;
    insert into public.events (device_id, day, kind, data, app_version)
      values (dev, current_date, 'routine_started', '{"run":1,"text":"Call Mum","test":true}', 'beta-5');
    reset role;
    insert into mw_check values (3, 'A row carrying task text is refused', 'FAIL: it was accepted');
  exception when others then
    reset role;
    insert into mw_check values (3, 'A row carrying task text is refused', 'PASS');
  end;

  -- 4. A row sent twice (same event_id) is stored once
  begin
    set local role anon;
    insert into public.events (event_id, device_id, day, kind, data, app_version)
      values ('bbbbbbbb-0000-4000-8000-00000000c0de', dev, current_date, 'tasks_skipped', jsonb_build_object('run',2,'rid','c0de0002','had_earlier',true,'test',true), 'beta-5');
    insert into public.events (event_id, device_id, day, kind, data, app_version)
      values ('bbbbbbbb-0000-4000-8000-00000000c0de', dev, current_date, 'tasks_skipped', jsonb_build_object('run',2,'rid','c0de0002','had_earlier',true,'test',true), 'beta-5');
    reset role;
    select count(*) into rows from public.events where event_id = 'bbbbbbbb-0000-4000-8000-00000000c0de';
    insert into mw_check values (4, 'A row sent twice is stored once', case when rows = 1 then 'PASS' else 'FAIL: stored ' || rows || ' times' end);
  exception when others then
    reset role;
    insert into mw_check values (4, 'A row sent twice is stored once', 'FAIL: ' || sqlerrm);
  end;

  -- 5. The app can't read anything back
  begin
    set local role anon;
    perform 1 from public.events limit 1;
    reset role;
    insert into mw_check values (5, 'The app can''t read the table', 'FAIL: anon can read events');
  exception when others then
    reset role;
    insert into mw_check values (5, 'The app can''t read the table', 'PASS');
  end;

  -- 6. Every report exists and can be read (by you, in the dashboard)
  begin
    perform 1 from public.retention_report limit 1;
    perform 1 from public.setup_report limit 1;
    perform 1 from public.legacy_retention_report limit 1;
    perform 1 from public.week1_frequency limit 1;
    perform 1 from public.report_exclusions limit 1;
    perform 1 from public.routine_runs limit 1;
    insert into mw_check values (6, 'All reports exist (retention, setup, legacy, week 1, exclusions, runs)', 'PASS');
  exception when others then
    insert into mw_check values (6, 'All reports exist (retention, setup, legacy, week 1, exclusions, runs)', 'FAIL: ' || sqlerrm);
  end;

  -- 7. Rows marked test are left out of the real numbers
  begin
    select exists (select 1 from public.test_devices where device_id = dev) into ok;
    if ok then
      select exists (select 1 from public.routine_cohort where device_id = dev and in_acquisition_cohort) into ok;
      insert into mw_check values (7, 'Test rows are kept out of the real numbers', case when ok then 'FAIL: counted in the cohort' else 'PASS' end);
    else
      insert into mw_check values (7, 'Test rows are kept out of the real numbers', 'FAIL: not listed in test_devices');
    end if;
  exception when others then
    insert into mw_check values (7, 'Test rows are kept out of the real numbers', 'FAIL: ' || sqlerrm);
  end;

  -- 8. The app can't read the reports either
  if to_regclass('public.retention_report') is null then
    insert into mw_check values (8, 'The app can''t read the reports', 'FAIL: the reports are missing (run the migrations)');
  else begin
    set local role anon;
    perform 1 from public.retention_report limit 1;
    reset role;
    insert into mw_check values (8, 'The app can''t read the reports', 'FAIL: anon can read retention_report');
  exception when others then
    reset role;
    insert into mw_check values (8, 'The app can''t read the reports', 'PASS');
  end; end if;

  -- Clean up: remove every row this check added
  delete from public.events where device_id = dev;
  select count(*) into rows from public.events where device_id = dev;
  insert into mw_check values (9, 'The check''s own rows were removed', case when rows = 0 then 'PASS' else 'FAIL: ' || rows || ' left' end);
end $$;

select n as "#", what as "check", result from mw_check order by n;
