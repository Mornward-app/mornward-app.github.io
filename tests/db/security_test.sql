-- Security and ingestion checks, run as the app's role (anon) and the signed-in role (authenticated).
-- Run on a dev database after tests/db/supabase_roles.sql and the migrations (see tests/README.md).
-- Each check prints PASS or raises an error that stops the script (psql -v ON_ERROR_STOP=1).
\set QUIET on
\pset tuples_only on

create or replace function pg_temp.expect_error(label text, stmt text, codes text[]) returns text language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL % (no error)', label;
exception when others then
  if sqlstate = any (codes) then return 'PASS  ' || label || '  (' || sqlstate || ')'; end if;
  raise exception 'FAIL % (got % %)', label, sqlstate, sqlerrm;
end $$;
create or replace function pg_temp.expect_ok(label text, stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'PASS  ' || label;
end $$;
grant execute on function pg_temp.expect_error(text, text, text[]), pg_temp.expect_ok(text, text) to anon, authenticated;

\echo '--- as anon (the publishable key) ---'
set role anon;
select pg_temp.expect_ok('anon can add a valid beta-5 row',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values
     ('00000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', current_date, 'routine_started',
      '{"run":1,"rid":"0a1b2c3d","home_screen":false,"first":true,"from":"redditads"}', 'beta-5')$q$);
select pg_temp.expect_ok('the same event_id sent again is skipped quietly (a retried send), not an error',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values
     ('00000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', current_date, 'routine_started',
      '{"run":1,"rid":"0a1b2c3d","home_screen":false,"first":true,"from":"redditads"}', 'beta-5')$q$);
select pg_temp.expect_ok('a batch holding the same event_id twice, plus a new row, goes in without error',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values
     ('00000000-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111', current_date, 'breathing_skipped', '{"run":1,"breaths_done":0}', 'beta-5'),
     ('00000000-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111', current_date, 'breathing_skipped', '{"run":1,"breaths_done":0}', 'beta-5'),
     ('00000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', current_date, 'routine_started', '{"run":1}', 'beta-5')$q$);
select pg_temp.expect_ok('rows from the live beta-2 app (no event_id) still go in',
  $q$insert into public.events (device_id, day, kind, data, app_version) values
     ('22222222-2222-4222-8222-222222222222', current_date, 'setup_done', '{"habit":"social","doors":["gmail","whatsapp"],"own_apps":0,"skipped":false,"from":"redditads","home_screen":false}', 'beta-2'),
     ('22222222-2222-4222-8222-222222222222', current_date, 'morning_start', '{"habit":"social","via":"calendar","home_screen":true}', 'beta-2'),
     ('22222222-2222-4222-8222-222222222222', current_date, 'morning_done', '{"breathe":"done","ticked":2,"reshuffles":1,"own_moves":false,"intention":true,"note":false,"minutes":5,"streak":3,"habit":"social","home_screen":true}', 'beta-2'),
     ('22222222-2222-4222-8222-222222222222', current_date, 'morning_done', '{"mode":"reset","breathe":"skipped","intention":false,"minutes":1,"practice":true,"home_screen":false}', 'beta-2'),
     ('22222222-2222-4222-8222-222222222222', current_date, 'rating', '{"value":"good","changed_from":"bad","home_screen":false}', 'beta-2'),
     ('22222222-2222-4222-8222-222222222222', current_date, 'door_open', '{"app":"own","home_screen":false}', 'beta-2')$q$);

-- Private text can't ride along in the data
select pg_temp.expect_error('task text in a new key is refused',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'tasks_saved', '{"count":1,"kept_defaults":false,"own":true,"text":"call mum"}')$q$, array['23514']);
select pg_temp.expect_error('task text in a known key is refused (count must be 1-3)',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'tasks_saved', '{"count":"call mum"}')$q$, array['23514']);
select pg_temp.expect_error('free text in an old kind is refused (no spaces or capitals)',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'morning_done', '{"habit":"Call Mum before work"}')$q$, array['23514']);
select pg_temp.expect_error('free text inside a list in an old kind is refused',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'setup_done', '{"doors":["gmail","my secret diary"]}')$q$, array['23514']);
select pg_temp.expect_error('nested objects are refused',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'door_open', '{"app":{"note":"x"}}')$q$, array['23514']);
select pg_temp.expect_error('an unknown kind is refused',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'task_text', '{}')$q$, array['23514']);
select pg_temp.expect_error('a wrong reminder action is refused',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'reminder_setup', '{"action":"reminder_delivered"}')$q$, array['23514']);
select pg_temp.expect_error('data over 2 KB is refused',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'screen_view', jsonb_build_object('screen', 'view_welcome', 'pad', to_jsonb(array_fill('a'::text, array[500]))))$q$, array['23514']);
select pg_temp.expect_error('a day outside today ± 2 is refused (insert policy)',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date - 3, 'routine_started', '{"run":1}')$q$, array['42501']);
select pg_temp.expect_error('setting created_at is refused (not granted)',
  $q$insert into public.events (device_id, day, kind, data, created_at) values (gen_random_uuid(), current_date, 'routine_started', '{"run":1}', now() - interval '1 year')$q$, array['42501']);

-- Nobody with the app's key can read, change or delete anything
select pg_temp.expect_error('anon cannot read events', 'select count(*) from public.events', array['42501']);
select pg_temp.expect_error('anon cannot read event ids', 'select event_id from public.events', array['42501']);
select pg_temp.expect_error('anon cannot update events', $q$update public.events set kind = 'rating'$q$, array['42501']);
select pg_temp.expect_error('anon cannot delete events', 'delete from public.events', array['42501']);
select pg_temp.expect_error('anon cannot read excluded_devices', 'select * from public.excluded_devices', array['42501']);
select pg_temp.expect_error('anon cannot add to excluded_devices', $q$insert into public.excluded_devices (device_id) values (gen_random_uuid())$q$, array['42501']);
select pg_temp.expect_error('anon cannot read retention_report', 'select * from public.retention_report', array['42501']);
select pg_temp.expect_error('anon cannot read routine_cohort', 'select * from public.routine_cohort', array['42501']);
select pg_temp.expect_error('anon cannot read routine_runs', 'select * from public.routine_runs', array['42501']);
select pg_temp.expect_error('anon cannot read setup_report', 'select * from public.setup_report', array['42501']);
select pg_temp.expect_error('anon cannot read legacy_retention_report', 'select * from public.legacy_retention_report', array['42501']);
select pg_temp.expect_error('anon cannot read the old views either', 'select * from public.testers', array['42501']);
reset role;

\echo '--- as authenticated (a signed-in Supabase user; the app has none) ---'
set role authenticated;
select pg_temp.expect_error('authenticated cannot read events', 'select count(*) from public.events', array['42501']);
select pg_temp.expect_error('authenticated cannot insert events', $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'routine_started', '{"run":1}')$q$, array['42501']);
select pg_temp.expect_error('authenticated cannot read retention_report', 'select * from public.retention_report', array['42501']);
reset role;

\echo '--- the database itself ---'
select case when relrowsecurity then 'PASS  row level security is on for events' else 'FAIL  RLS off on events' end
  from pg_class where oid = 'public.events'::regclass;
select case when relrowsecurity then 'PASS  row level security is on for excluded_devices' else 'FAIL  RLS off on excluded_devices' end
  from pg_class where oid = 'public.excluded_devices'::regclass;
select case when count(*) = 0 then 'PASS  no function in public is executable by anon'
  else 'FAIL  anon can execute: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
select case when count(*) = 1 then 'PASS  a re-sent event_id was stored once' else 'FAIL  stored ' || count(*) || ' times' end
  from public.events where event_id = '00000000-0000-4000-8000-0000000000a1';
select case when count(*) = 1 then 'PASS  an event_id repeated inside one batch was stored once' else 'FAIL  stored ' || count(*) || ' times' end
  from public.events where event_id = '00000000-0000-4000-8000-0000000000a2';
select case when count(*) = 6 then 'PASS  all six beta-2 rows were stored' else 'FAIL  beta-2 rows: ' || count(*) end
  from public.events where device_id = '22222222-2222-4222-8222-222222222222';
select case when not convalidated then 'PASS  the payload check skips rows stored before it (NOT VALID)' else 'FAIL  payload check validated old rows' end
  from pg_constraint where conname = 'events_payload_ok';
delete from public.events where device_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
