-- Setup events and setup_report: what's accepted, what's refused, and exact counts with their windows.
-- Days are relative to current_date (T). Run after the migrations (tests/README.md). Rolls itself back.
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

-- What the app may send, and what it may not
select pg_temp.refused('setup_started can''t carry platform names',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'setup_started', '{"run":0,"apps":["instagram"]}')$q$);
select pg_temp.refused('setup_completed can''t carry task text',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'setup_completed', '{"run":0,"tasks":"Stretch"}')$q$);
select pg_temp.refused('setup_completed can''t carry a reminder time',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'setup_completed', '{"run":0,"tasks_prepared":1,"at":"07:00"}')$q$);
select pg_temp.refused('tasks_prepared is 0-3',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'setup_completed', '{"run":0,"tasks_prepared":4}')$q$);
insert into public.events (event_id, device_id, day, kind, data, app_version) values
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-00000000000f', current_date, 'setup_started', '{"run":0,"home_screen":false}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-00000000000f', current_date, 'setup_completed', '{"run":0,"home_screen":false,"tasks_prepared":2}', 'beta-5'),
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-00000000000f', current_date, 'tasks_saved', '{"run":1,"rid":"0f0f0f0f","home_screen":false,"count":2,"kept_defaults":false,"prepared":true,"own":false}', 'beta-5');
select pg_temp.check('the app''s setup rows go in', count(*)::text, '3') from public.events where device_id = 'aaaaaaaa-0000-4000-8000-00000000000f';
delete from public.events where device_id = 'aaaaaaaa-0000-4000-8000-00000000000f';

-- Seeded people
create temp table seed (n serial, dev text, d int, kind text, data jsonb);
insert into seed (dev, d, kind, data) values
 -- S1 sets up in the evening, starts the next morning, full routine
 ('S1', -10, 'setup_started', '{"run":0}'), ('S1', -10, 'setup_completed', '{"run":0,"tasks_prepared":2}'),
 ('S1', -9, 'routine_started', '{"run":1,"rid":"51000001","first":true}'), ('S1', -9, 'core_routine_completed', '{"run":1,"rid":"51000001","def":2}'),
 -- S2 sets up, never starts
 ('S2', -10, 'setup_started', '{"run":0}'), ('S2', -10, 'setup_completed', '{"run":0,"tasks_prepared":0}'),
 -- S3 sets up, starts 5 days later, skips steps
 ('S3', -10, 'setup_started', '{"run":0}'), ('S3', -10, 'setup_completed', '{"run":0,"tasks_prepared":3}'),
 ('S3', -5, 'routine_started', '{"run":1,"rid":"53000001","first":true}'),
 ('S3', -5, 'routine_finished', '{"run":1,"rid":"53000001","breathing":"skipped","tasks":"skipped","core":false,"def":2,"seconds":5}'),
 -- S4 sets up two days ago: day 1 isn't final yet, so it isn't a failure
 ('S4', -2, 'setup_started', '{"run":0}'), ('S4', -2, 'setup_completed', '{"run":0,"tasks_prepared":1}'),
 -- S5 starts setup, never finishes
 ('S5', -10, 'setup_started', '{"run":0}'),
 -- S6 test device: excluded everywhere
 ('S6', -10, 'setup_started', '{"run":0,"test":true}'), ('S6', -10, 'setup_completed', '{"run":0,"tasks_prepared":2,"test":true}'),
 ('S6', -9, 'routine_started', '{"run":1,"rid":"56000001","first":true,"test":true}'),
 -- S7 sets up and starts the same day, three days ago: converted, but day 1 isn't final yet
 ('S7', -3, 'setup_started', '{"run":0}'), ('S7', -3, 'setup_completed', '{"run":0,"tasks_prepared":2}'),
 ('S7', -3, 'routine_started', '{"run":1,"rid":"57000001","first":true}');
create temp table devs as select dev, md5('mornward-setup-' || dev)::uuid as device_id from (select distinct dev from seed) x;
insert into public.events (event_id, device_id, day, kind, data, app_version, created_at)
select gen_random_uuid(), v.device_id, current_date + s.d, s.kind, s.data, 'beta-5', (current_date + s.d)::timestamptz + s.n * interval '1 minute'
from seed s join devs v using (dev);

select pg_temp.check('setup_report ' || r.metric, r.numerator || '/' || r.denominator || ' (' || r.not_yet_eligible || ' not yet)', w.want)
from public.setup_report r
join (values
  ('setup_completed_7d',    '3/4 (2 not yet)'),
  ('first_routine_by_day1', '1/3 (2 not yet)'),
  ('first_routine_by_day7', '2/3 (2 not yet)'),
  ('first_full_by_day7',    '1/3 (2 not yet)')
) w(metric, want) using (metric)
order by r.ord;
select pg_temp.check('setup_report has 4 rows', count(*)::text, '4') from public.setup_report;
-- Setup alone is not a routine: S2, S4 and S5 are in no routine report
select pg_temp.check('setup without a routine adds nothing to routine_cohort', count(*)::text, '0')
  from public.routine_cohort c join devs v using (device_id) where v.dev in ('S2', 'S4', 'S5');
select pg_temp.check('S1, S3 and S7 are in the acquisition cohort (first routine marked first)', string_agg(v.dev, ',' order by v.dev), 'S1,S3,S7')
  from public.routine_cohort c join devs v using (device_id) where c.in_acquisition_cohort;

rollback;
