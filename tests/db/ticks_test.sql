-- tasks_ticked and the routine_cohort reminder fix (migration 20261007000000_task_ticks.sql). Rolls itself back.
\set QUIET on
\pset tuples_only on
begin;

create or replace function pg_temp.check(label text, got text, want text) returns text language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got [%], want [%]', label, got, want; end if;
  return 'PASS  ' || label || ' = ' || want;
end $$;
create or replace function pg_temp.refused(label text, stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL % (accepted)', label;
exception when check_violation then return 'PASS  ' || label;
end $$;

-- What the app may send: numbers only
select pg_temp.refused('tasks_ticked can''t carry task text',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'tasks_ticked', '{"run":1,"ticked":1,"total":2,"task":"Stretch"}')$q$);
select pg_temp.refused('tasks_ticked needs both numbers',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'tasks_ticked', '{"run":1,"ticked":1}')$q$);
select pg_temp.refused('ticked is never more than total',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'tasks_ticked', '{"run":1,"ticked":3,"total":2}')$q$);
select pg_temp.refused('ticked is 1-3',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'tasks_ticked', '{"run":1,"ticked":0,"total":2}')$q$);
select pg_temp.refused('total is 1-3',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'tasks_ticked', '{"run":1,"ticked":1,"total":4}')$q$);
select pg_temp.refused('ticked as text is refused',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'tasks_ticked', '{"run":1,"ticked":"1","total":2}')$q$);

-- A: saved 2 tasks, ticked 1 then 2 (two rows); B: saved 3, ticked 1; C: saved 2, ticked none; T: a test device
insert into public.events (event_id, device_id, day, kind, data, app_version) values
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000a1', current_date - 3, 'tasks_saved', '{"run":1,"rid":"0000a001","count":2,"kept_defaults":true,"own":false}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000a1', current_date - 3, 'tasks_ticked', '{"run":1,"rid":"0000a001","ticked":1,"total":2}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000a1', current_date - 3, 'tasks_ticked', '{"run":1,"rid":"0000a001","ticked":2,"total":2}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000b1', current_date - 3, 'tasks_saved', '{"run":1,"rid":"0000b001","count":3,"kept_defaults":false,"own":true}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000b1', current_date - 3, 'tasks_ticked', '{"run":1,"rid":"0000b001","ticked":1,"total":3}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000c1', current_date - 3, 'tasks_saved', '{"run":1,"rid":"0000c001","count":2,"kept_defaults":true,"own":false}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000d1', current_date - 3, 'tasks_saved', '{"run":1,"rid":"0000d001","count":1,"kept_defaults":true,"own":false,"test":true}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000d1', current_date - 3, 'tasks_ticked', '{"run":1,"rid":"0000d001","ticked":1,"total":1,"test":true}', 'beta-5');

select pg_temp.check('task_ticks: the highest number reached (A ticked 2 of 2)',
  (select ticked || '/' || total from public.task_ticks where device_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), '2/2');
select pg_temp.check('task_ticks: test devices left out',
  (select count(*)::text from public.task_ticks where device_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), '0');
select pg_temp.check('task_ticks_report: saved / ticked at least one / ticked all',
  -- A, B and C saved tasks (D is a test device); A and B ticked; only A ticked all
  (select devices_saved_tasks || '/' || ticked_at_least_one || '/' || ticked_all from public.task_ticks_report where day = current_date - 3), '3/2/1');

-- The cohort: a first routine opened from the reminder counts when setup happened on the same ID
insert into public.events (event_id, device_id, day, kind, data, app_version) values
  -- E: set up, then the first routine opened from the alarm Shortcut (same ID, or carried in with #r=)
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000e1', current_date - 6, 'setup_started', '{"run":0}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000e1', current_date - 6, 'setup_completed', '{"run":0,"tasks_prepared":2}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000e1', current_date - 5, 'routine_started', '{"run":1,"rid":"0000e001","first":true,"via":"alarm"}', 'beta-5'),
  -- F: no setup on this ID, first routine opened from the calendar (a returning person in a browser with other storage)
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000f1', current_date - 5, 'routine_started', '{"run":1,"rid":"0000f001","first":true,"via":"calendar"}', 'beta-5'),
  -- G: no reminder, set up and started the usual way
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000a7', current_date - 5, 'routine_started', '{"run":1,"rid":"0000a701","first":true}', 'beta-5');

select pg_temp.check('cohort: set up, first routine from the reminder: counted',
  (select in_acquisition_cohort::text || '/' || set_up_here::text from public.routine_cohort where device_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'), 'true/true');
select pg_temp.check('cohort: first routine from a reminder with no setup on this ID: left out',
  (select in_acquisition_cohort::text from public.routine_cohort where device_id = 'aaaaaaaa-0000-4000-8000-0000000000f1'), 'false');
select pg_temp.check('cohort: an ordinary first routine: counted',
  (select in_acquisition_cohort::text from public.routine_cohort where device_id = 'aaaaaaaa-0000-4000-8000-0000000000a7'), 'true');
select pg_temp.check('report_exclusions names the reminder case with no setup',
  (select (count(*) > 0)::text from public.report_exclusions where reason like 'first counted routine opened from a reminder, with no setup%'), 'true');
select pg_temp.check('the app can''t read the new reports',
  (select (has_table_privilege('anon', 'public.task_ticks', 'select') or has_table_privilege('anon', 'public.task_ticks_report', 'select'))::text), 'false');

rollback;
