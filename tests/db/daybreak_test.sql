-- The Daybreak app's counts (migration 20261011000000_daybreak_counts.sql). Rolls itself back.
\set QUIET on
\pset tuples_only on
begin;

create or replace function pg_temp.check(label text, got text, want text) returns text language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got [%], want [%]', label, got, want; end if;
  return 'PASS  ' || label || ' = ' || want;
end $$;
create or replace function pg_temp.ok(label text, stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'PASS  ' || label;
end $$;
create or replace function pg_temp.refused(label text, stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL % (accepted)', label;
exception when check_violation or insufficient_privilege then return 'PASS  ' || label;
end $$;
grant execute on function pg_temp.ok(text, text), pg_temp.refused(text, text) to anon;

-- As the app (anon, the publishable key): exactly the rows src/lib/stats.ts sends
set role anon;
select pg_temp.ok('app_opened',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000001', current_date, 'app_opened',
     '{"run":0,"home_screen":true,"platform":"ios","screen":"wake","onboarded":true}', 'daybreak-1')$q$);
select pg_temp.ok('evening_set',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000001', current_date + 1, 'evening_set',
     '{"run":0,"home_screen":true,"tasks":2,"own":false,"pact":true,"push":true}', 'daybreak-1')$q$);
select pg_temp.ok('sun_hold_done',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000001', current_date, 'sun_hold_done',
     '{"run":0,"home_screen":true,"breaths":3}', 'daybreak-1')$q$);
select pg_temp.ok('breaths_skipped',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000002', current_date, 'breaths_skipped',
     '{"run":0,"home_screen":false,"held":1,"test":true}', 'daybreak-1')$q$);
select pg_temp.ok('morning_completed',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000001', current_date, 'morning_completed',
     '{"run":0,"home_screen":true,"tasks":2,"breathing":"held","streak":3,"sunrises":5}', 'daybreak-1')$q$);
select pg_temp.ok('card_opened',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000001', current_date, 'card_opened',
     '{"run":0,"home_screen":true}', 'daybreak-1')$q$);
select pg_temp.ok('history_synced (the one-time catch-up)',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000001', current_date, 'history_synced',
     '{"run":0,"home_screen":true,"sunrises":2,"streak":0,"days":["2026-10-08","2026-10-09"],"onboarded":true}', 'daybreak-1')$q$);
select pg_temp.ok('tasks_ticked (folded in from 007)',
  $q$insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), gen_random_uuid(), current_date, 'tasks_ticked', '{"run":1,"ticked":1,"total":2}', 'beta-5')$q$);

-- Refused: words, out-of-range numbers, missing fields, back-dated rows
select pg_temp.refused('the pact can''t be sent',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'evening_set', '{"run":0,"tasks":1,"pact":"To feel like myself again"}')$q$);
select pg_temp.refused('task names can''t be sent',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'morning_completed', '{"run":0,"tasks":1,"breathing":"held","streak":1,"sunrises":1,"task":"Stretch"}')$q$);
select pg_temp.refused('the wake time can''t be sent',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'evening_set', '{"run":0,"tasks":1,"wake":420}')$q$);
select pg_temp.refused('a streak longer than the total',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'morning_completed', '{"run":0,"tasks":1,"breathing":"held","streak":4,"sunrises":3}')$q$);
select pg_temp.refused('morning_completed needs all four',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'morning_completed', '{"run":0,"tasks":1}')$q$);
select pg_temp.refused('breathing is held or skipped',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'morning_completed', '{"run":0,"tasks":1,"breathing":"done","streak":1,"sunrises":1}')$q$);
select pg_temp.refused('sun_hold_done is three breaths',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'sun_hold_done', '{"run":0,"breaths":2}')$q$);
select pg_temp.refused('a skip after 3 holds isn''t a skip',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'breaths_skipped', '{"run":0,"held":3}')$q$);
select pg_temp.refused('platform is ios, android or web',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'app_opened', '{"run":0,"platform":"windows"}')$q$);
select pg_temp.refused('history days must be dates',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'history_synced', '{"run":0,"sunrises":1,"days":["yesterday"]}')$q$);
select pg_temp.refused('history holds at most 60 days',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date, 'history_synced',
     jsonb_build_object('run', 0, 'sunrises', 61, 'days', (select jsonb_agg(to_char(date '2026-01-01' + i, 'YYYY-MM-DD')) from generate_series(0, 60) i)))$q$);
select pg_temp.refused('a back-dated row (the policy takes two days either side of today)',
  $q$insert into public.events (device_id, day, kind, data) values (gen_random_uuid(), current_date - 5, 'morning_completed', '{"run":0,"tasks":1,"breathing":"held","streak":1,"sunrises":1}')$q$);
reset role;

-- Reports. Device 1 (above): synced two earlier mornings, opened, set an evening, held the sun, finished today.
-- Device 2 is a test device (test: true): left out. Device 3: opened 3 days ago and the day after, finished nothing.
insert into public.events (event_id, device_id, day, kind, data, app_version) values
  (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000003', current_date - 3, 'app_opened', '{"run":0,"platform":"web","screen":"welcome","onboarded":false}', 'daybreak-1'),
  (gen_random_uuid(), 'dbdbdbdb-0000-4000-8000-000000000003', current_date - 2, 'app_opened', '{"run":0,"platform":"web","screen":"sleep","onboarded":true}', 'daybreak-1');
select pg_temp.check('daybreak_testers: device 1 mornings (2 synced + today)',
  (select mornings_completed || '/' || mornings_before_counts from public.daybreak_testers where device_id = 'dbdbdbdb-0000-4000-8000-000000000001'), '3/2');
select pg_temp.check('daybreak_testers: device 1 first day is its first synced morning',
  (select first_day::text from public.daybreak_testers where device_id = 'dbdbdbdb-0000-4000-8000-000000000001'), '2026-10-08');
select pg_temp.check('daybreak_testers: device 1 platform, evenings, sun holds, cards, best streak',
  (select platform || '/' || evenings_set || '/' || sun_holds || '/' || cards_opened || '/' || best_streak from public.daybreak_testers
   where device_id = 'dbdbdbdb-0000-4000-8000-000000000001'), 'ios/1/1/1/3');
select pg_temp.check('daybreak_testers: test devices left out',
  (select count(*)::text from public.daybreak_testers where device_id = 'dbdbdbdb-0000-4000-8000-000000000002'), '0');
select pg_temp.check('daybreak_daily today: opened / mornings',
  (select opened || '/' || mornings_completed from public.daybreak_daily where day = current_date), '1/1');
select pg_temp.check('daybreak_retention: device 3 came back on day 1; device 1 (day 0 = Oct 8) did not',
  (select numerator || '/' || denominator from public.daybreak_retention where metric = 'came_back_day1'), '1/2');

rollback;
