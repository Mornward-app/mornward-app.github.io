-- Retention metrics: seeded people with known histories, and the exact counts every report must give.
-- Days are relative to current_date (T), so the test means the same thing whenever it runs.
-- Run on a dev database after the migrations (see tests/README.md). Stops at the first mismatch.
\set QUIET on
\pset tuples_only on
begin;

create temp table seed (n serial, dev text, d int, kind text, data jsonb, eid uuid default gen_random_uuid());
-- dev: a letter; d: day offset from T; rid r1/r2... tells two routines on one day apart
insert into seed (dev, d, kind, data) values
-- A returner: full routine day 0; day 1 reached the end with both steps skipped; full on day 2 and day 7
 ('A', -20, 'routine_started', '{"run":1,"rid":"a0000001","first":true}'),
 ('A', -20, 'breathing_completed', '{"run":1,"rid":"a0000001"}'),
 ('A', -20, 'tasks_saved', '{"run":1,"rid":"a0000001","count":2,"kept_defaults":true,"own":false}'),
 ('A', -20, 'routine_finished', '{"run":1,"rid":"a0000001","breathing":"completed","tasks":"saved","core":true,"def":2,"seconds":70}'),
 ('A', -20, 'core_routine_completed', '{"run":1,"rid":"a0000001","def":2}'),
 ('A', -19, 'routine_started', '{"run":1,"rid":"a0000002"}'),
 ('A', -19, 'breathing_skipped', '{"run":1,"rid":"a0000002","breaths_done":0}'),
 ('A', -19, 'tasks_skipped', '{"run":1,"rid":"a0000002","had_earlier":false}'),
 ('A', -19, 'routine_finished', '{"run":1,"rid":"a0000002","breathing":"skipped","tasks":"skipped","core":false,"def":2,"seconds":5}'),
 ('A', -18, 'routine_started', '{"run":1,"rid":"a0000003"}'),
 ('A', -18, 'routine_finished', '{"run":1,"rid":"a0000003","breathing":"completed","tasks":"saved","core":true,"def":2,"seconds":60}'),
 ('A', -18, 'core_routine_completed', '{"run":1,"rid":"a0000003","def":2}'),
 ('A', -13, 'routine_started', '{"run":1,"rid":"a0000004"}'),
 ('A', -13, 'core_routine_completed', '{"run":1,"rid":"a0000004","def":2}'),
-- B nonreturner: skipped both on day 0, never back
 ('B', -20, 'routine_started', '{"run":1,"rid":"b0000001","first":true,"from":"redditads"}'),
 ('B', -20, 'breathing_skipped', '{"run":1,"rid":"b0000001","breaths_done":1}'),
 ('B', -20, 'tasks_skipped', '{"run":1,"rid":"b0000001","had_earlier":false}'),
 ('B', -20, 'routine_finished', '{"run":1,"rid":"b0000001","breathing":"skipped","tasks":"skipped","core":false,"def":2,"seconds":9}'),
-- C duplicate sessions: two full routines on day 0 (and a row that arrived twice), two routines on day 1 (one full)
 ('C', -15, 'routine_started', '{"run":1,"rid":"c0000001","first":true}'),
 ('C', -15, 'routine_started', '{"run":1,"rid":"c0000001","first":true}'),
 ('C', -15, 'routine_finished', '{"run":1,"rid":"c0000001","breathing":"completed","tasks":"saved","core":true,"def":2,"seconds":60}'),
 ('C', -15, 'core_routine_completed', '{"run":1,"rid":"c0000001","def":2}'),
 ('C', -15, 'routine_started', '{"run":2,"rid":"c0000002"}'),
 ('C', -15, 'routine_finished', '{"run":2,"rid":"c0000002","breathing":"completed","tasks":"saved","core":true,"def":2,"seconds":60}'),
 ('C', -15, 'core_routine_completed', '{"run":2,"rid":"c0000002","def":2}'),
 ('C', -14, 'routine_started', '{"run":1,"rid":"c0000003"}'),
 ('C', -14, 'routine_finished', '{"run":1,"rid":"c0000003","breathing":"completed","tasks":"saved","core":true,"def":2,"seconds":60}'),
 ('C', -14, 'core_routine_completed', '{"run":1,"rid":"c0000003","def":2}'),
 ('C', -14, 'routine_started', '{"run":2,"rid":"c0000004"}'),
-- D recent joiner (day 0 = T-2): too new for every metric
 ('D', -2, 'routine_started', '{"run":1,"rid":"d0000001","first":true}'),
 ('D', -2, 'routine_finished', '{"run":1,"rid":"d0000001","breathing":"completed","tasks":"saved","core":true,"def":2,"seconds":60}'),
 ('D', -2, 'core_routine_completed', '{"run":1,"rid":"d0000001","def":2}'),
-- E day 0 = T-3: day-0 metrics final, day 1 (T-2) not yet, so its return must not count
 ('E', -3, 'routine_started', '{"run":1,"rid":"e0000001","first":true}'),
 ('E', -3, 'routine_finished', '{"run":1,"rid":"e0000001","breathing":"completed","tasks":"saved","core":true,"def":2,"seconds":60}'),
 ('E', -3, 'core_routine_completed', '{"run":1,"rid":"e0000001","def":2}'),
 ('E', -2, 'routine_started', '{"run":1,"rid":"e0000002"}'),
-- F test device (?test=1) and G (listed in excluded_devices): both "return", neither may count
 ('F', -20, 'routine_started', '{"run":1,"rid":"f0000001","first":true,"test":true}'),
 ('F', -19, 'routine_started', '{"run":1,"rid":"f0000002","test":true}'),
 ('G', -20, 'routine_started', '{"run":1,"rid":"a1000001","first":true}'),
 ('G', -19, 'routine_started', '{"run":1,"rid":"a1000002"}'),
-- H used the beta-2 app first (legacy rows below), then beta-5
 ('H', -28, 'routine_started', '{"run":1,"rid":"b1000001","first":true}'),
-- I first counted routine isn't marked first (counts were off at first, or carried in)
 ('I', -20, 'routine_started', '{"run":1,"rid":"c1000001"}'),
 ('I', -19, 'routine_started', '{"run":1,"rid":"c1000002"}'),
-- J first counted routine opened from a reminder link (a returning person in separate browser storage)
 ('J', -20, 'routine_started', '{"run":1,"rid":"d1000001","first":true,"via":"calendar"}'),
-- K activates later: day 0 (T-25) no full routine; first full routine T-23; back T-22; full again T-16
 ('K', -25, 'routine_started', '{"run":1,"rid":"e1000001","first":true}'),
 ('K', -25, 'routine_finished', '{"run":1,"rid":"e1000001","breathing":"skipped","tasks":"saved","core":false,"def":2,"seconds":30}'),
 ('K', -23, 'routine_started', '{"run":1,"rid":"e1000002"}'),
 ('K', -23, 'core_routine_completed', '{"run":1,"rid":"e1000002","def":2}'),
 ('K', -22, 'routine_started', '{"run":1,"rid":"e1000003"}'),
 ('K', -16, 'routine_started', '{"run":1,"rid":"e1000004"}'),
 ('K', -16, 'core_routine_completed', '{"run":1,"rid":"e1000004","def":2}'),
-- L beta-4 rows: core under the old definition (no def). Must not count as core under definition 2.
 ('L', -20, 'routine_started', '{"run":1,"first":true}'),
 ('L', -20, 'breathing_completed', '{"run":1}'),
 ('L', -20, 'intention_saved', '{"run":1,"count":1,"kept_defaults":false,"own":true}'),
 ('L', -20, 'routine_finished', '{"run":1,"breathing":"completed","intention":"saved","seconds":50}'),
 ('L', -20, 'core_routine_completed', '{"run":1}'),
-- M day 0 = T-4: exactly at the day-1 boundary (final today); came back on day 1
 ('M', -4, 'routine_started', '{"run":1,"rid":"f1000001","first":true}'),
 ('M', -4, 'routine_finished', '{"run":1,"rid":"f1000001","breathing":"skipped","tasks":"skipped","core":false,"def":2,"seconds":4}'),
 ('M', -3, 'routine_started', '{"run":1,"rid":"f1000002"}'),
-- Legacy (beta-2) people for legacy_retention_report: P practice day 0, real morning day 1; Q setup only; R too recent
 ('P', -20, 'setup_done', '{"habit":"social","doors":[],"own_apps":0,"skipped":false,"from":"redditads"}'),
 ('P', -20, 'morning_done', '{"mode":"reset","breathe":"done","intention":false,"minutes":1,"practice":true}'),
 ('P', -19, 'morning_start', '{"habit":"social"}'),
 ('P', -19, 'morning_done', '{"breathe":"done","ticked":2,"reshuffles":0,"own_moves":false,"intention":true,"note":false,"minutes":4,"streak":1,"habit":"social"}'),
 ('Q', -20, 'setup_done', '{"skipped":true,"from":null}'),
 ('R', -2, 'setup_done', '{"skipped":true,"from":null}'),
 ('H', -30, 'setup_done', '{"habit":"video","doors":["youtube"],"own_apps":0,"skipped":false,"from":null}'),
 ('H', -30, 'morning_start', '{"habit":"video"}'),
 ('H', -30, 'morning_done', '{"breathe":"skipped","ticked":0,"reshuffles":0,"own_moves":false,"intention":false,"note":false,"minutes":2,"streak":1,"habit":"video"}');

create temp table devs as
select dev, md5('mornward-test-' || dev)::uuid as device_id from (select distinct dev from seed) x;
insert into public.excluded_devices (device_id, note) select device_id, 'metrics test' from devs where dev = 'G';
insert into public.events (event_id, device_id, day, kind, data, app_version, created_at)
select case when s.data ? 'rid' then s.eid end, v.device_id, current_date + s.d, s.kind, s.data,
       case when s.kind in ('setup_done', 'morning_start', 'morning_done') then 'beta-2' when s.data ? 'rid' then 'beta-5' else 'beta-4' end,
       (current_date + s.d)::timestamptz + interval '7 hours' + s.n * interval '1 second'
from seed s join devs v using (dev);

create or replace function pg_temp.check(label text, got text, want text) returns text language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got [%], want [%]', label, got, want; end if;
  return 'PASS  ' || label || ' = ' || want;
end $$;

-- Each report row as "numerator/denominator, not yet eligible"
select pg_temp.check(r.cohort || ' ' || r.metric, r.numerator || '/' || r.denominator || ' (' || r.not_yet_eligible || ' not yet)', w.want)
from public.retention_report r
join (values
  ('acquisition', 'first_day_finished', '7/7 (1 not yet)'),
  ('acquisition', 'first_day_core',     '3/7 (1 not yet)'),
  ('acquisition', 'd1_return',          '3/6 (2 not yet)'),
  ('acquisition', 'd1_core',            '1/6 (2 not yet)'),
  ('acquisition', 'd7_return',          '1/5 (3 not yet)'),
  ('acquisition', 'd7_core',            '1/5 (3 not yet)'),
  ('acquisition', 'week1_3plus_days',   '2/5 (3 not yet)'),
  ('acquisition', 'repeat_core_7d',     '3/5 (3 not yet)'),
  ('activation',  'd1_return',          '3/3 (2 not yet)'),
  ('activation',  'd1_core',            '1/3 (2 not yet)'),
  ('activation',  'd7_return',          '2/3 (2 not yet)'),
  ('activation',  'week1_3plus_days',   '1/3 (2 not yet)'),
  ('activation',  'repeat_core_7d',     '3/3 (2 not yet)')
) w(cohort, metric, want) on w.cohort = r.cohort and w.metric = r.metric
order by r.ord;
select pg_temp.check('retention_report has 13 rows', count(*)::text, '13') from public.retention_report;
select pg_temp.check('pct is numerator ÷ denominator (acquisition d1_return)', pct::text, '50.0')
  from public.retention_report where cohort = 'acquisition' and metric = 'd1_return';

select pg_temp.check('acquisition cohort members', string_agg(v.dev, ',' order by v.dev), 'A,B,C,D,E,K,L,M')
  from public.routine_cohort c join devs v using (device_id) where c.in_acquisition_cohort;
select pg_temp.check('activation days', string_agg(v.dev || '@' || (c.activation_day - current_date), ',' order by v.dev), 'A@-20,C@-15,D@-2,E@-3,K@-23')
  from public.routine_cohort c join devs v using (device_id) where c.in_acquisition_cohort and c.activation_day is not null;
select pg_temp.check('exclusions', string_agg(reason || ':' || devices, ' | ' order by reason),
  'first counted routine opened from a reminder (separate browser storage):1 | first counted routine was not the device''s first (counts were off, or carried in):1 | in the acquisition cohort:8 | test device (?test=1 or excluded_devices):2 | used an earlier version (not new):1')
  from public.report_exclusions;
select pg_temp.check('week1_frequency', string_agg(active_days || ':' || devices, ',' order by active_days), '1:2,2:1,3:2')
  from public.week1_frequency;

-- Duplicates and sessions
select pg_temp.check('C day 0: two routines, counted once as a day', routines || ' routines, started=' || started, '2 routines, started=true')
  from public.routine_days d join devs v using (device_id) where v.dev = 'C' and d.day = current_date - 15;
select pg_temp.check('the row that arrived twice is one routine run', count(*)::text, '1')
  from public.routine_runs r join devs v using (device_id) where v.dev = 'C' and r.run_key = 'c0000001';
select pg_temp.check('routine_daily T-15 (C only)', devices_started || '/' || devices_finished || '/' || devices_core || '/' || routines_started, '1/1/1/2')
  from public.routine_daily where day = current_date - 15;
select pg_temp.check('routine_daily T-20 leaves test devices out (A,B,I,J,L)', devices_started::text, '5')
  from public.routine_daily where day = current_date - 20;
select pg_temp.check('beta-4 core is kept apart (L)', core_completed || '/' || core_completed_def1, 'false/true')
  from public.routine_runs r join devs v using (device_id) where v.dev = 'L';

-- Legacy (beta-2) report, kept separate
select pg_temp.check('legacy ' || r.metric, r.numerator || '/' || r.denominator || ' (' || r.not_yet_eligible || ' not yet)', w.want)
from public.legacy_retention_report r
join (values
  ('first_day_real_morning', '1/3 (1 not yet)'),
  ('d1_return',              '1/3 (1 not yet)'),
  ('d1_core',                '1/3 (1 not yet)'),
  ('d7_return',              '0/3 (1 not yet)'),
  ('any_visit_days_1_7',     '1/3 (1 not yet)'),
  ('week1_3plus_days',       '0/3 (1 not yet)')
) w(metric, want) using (metric)
order by r.ord;

-- The old beta-2 views (kept unchanged for history): confirm what the audit said about them
select pg_temp.check('old pass_rules counts every device, test and too-new ones included', testers::text, '16')
  from public.pass_rules;
select pg_temp.check('old testers: first_day is the first event of any kind (P: setup day, not first real morning)',
  (t.first_day - current_date)::text, '-20')
  from public.testers t join devs v using (device_id) where v.dev = 'P';
select pg_temp.check('old pass_rules: % with 4+ mornings divides by all 16, recent ones included', pct_4_of_first_7_mornings::text, '0')
  from public.pass_rules;

rollback;
