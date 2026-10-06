-- Mornward migration 2026-10-04: the one-minute routine (app version beta-4)
--
-- Additive only. It:
--   1. allows seven new event kinds (the old ones stay allowed, so old rows and old app versions keep working)
--   2. adds excluded_devices, a private list of your own/test devices to leave out of the numbers
--   3. adds four read-only views: routine_runs, routine_cohort, routine_metrics, routine_daily
-- It does not change or delete any row, does not touch the insert policy, and leaves row level security on.
-- Safe to run more than once until 20261005000000 is applied. After that, re-run only the newest migration:
-- 20261005 replaces these views, so re-running this file fails (its transaction rolls back and changes nothing).
-- Apply it BEFORE the beta-4 app goes live: until then the database rejects the new kinds and those rows are dropped
-- by the app (it does not retry rejected rows).
--
-- Definitions are explained in supabase/ANALYTICS.md ("Routine metrics (beta-4)").

begin;

-- 1. New kinds ------------------------------------------------------------------------------------------
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  -- up to beta-3
  'morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view',
  -- beta-4: the one-minute routine
  'routine_started', 'breathing_completed', 'breathing_skipped', 'intention_saved', 'intention_skipped',
  'routine_finished', 'core_routine_completed', 'install_prompt', 'app_installed',
  -- later kinds (20261005, 20261006), listed here too so re-running this file never fails on newer rows
  'tasks_saved', 'tasks_skipped', 'reminder_setup', 'setup_started', 'setup_completed', 'tasks_ticked'));

-- 2. Devices to leave out (you, family, test phones) --------------------------------------------------------
-- Add yours from the dashboard:  insert into public.excluded_devices (device_id, note) values ('<id>', 'my phone');
-- (Your ID is under "Privacy and your data" in the app.) Rows the app marks test: true (?test=1) are left out too.
create table if not exists public.excluded_devices (
  device_id uuid primary key,
  note      text check (char_length(note) <= 200),
  added_at  timestamptz not null default now()
);
alter table public.excluded_devices enable row level security;
revoke all on public.excluded_devices from anon, authenticated;
-- No policies on purpose: with RLS on and no grants, the app's key can neither read nor write it.

-- 3. Views (dashboard only) -----------------------------------------------------------------------------------

-- One row per routine: device, local day the routine started, run number that day (1 = first, 2 = done again).
-- bool_or makes duplicate rows (a retried send) count once.
create or replace view public.routine_runs with (security_invoker = on) as
select
  e.device_id,
  e.day,
  case when e.data->>'run' ~ '^[0-9]{1,4}$' then (e.data->>'run')::int else 1 end as run,
  bool_or(e.kind = 'routine_started')        as started,
  bool_or(e.kind = 'breathing_completed')    as breathing_completed,
  bool_or(e.kind = 'breathing_skipped')      as breathing_skipped,
  bool_or(e.kind = 'intention_saved')        as intention_saved,
  bool_or(e.kind = 'intention_skipped')      as intention_skipped,
  bool_or(e.kind = 'routine_finished')       as finished,
  bool_or(e.kind = 'core_routine_completed') as core_completed,
  coalesce(bool_or(e.data->>'first' = 'true'), false)       as marked_first,
  max(e.data->>'from')                       as link_from,
  coalesce(bool_or(e.data->>'home_screen' = 'true'), false) as home_screen,
  coalesce(bool_or(e.data->>'via' = 'calendar'), false)     as via_calendar,
  -- coalesce: a missing key compares as NULL, and NULL would silently drop the device from every count
  coalesce(bool_or(e.data->>'test' = 'true'), false)
    or exists (select 1 from public.excluded_devices x where x.device_id = e.device_id) as is_test,
  min(e.created_at)                          as first_seen
from public.events e
where e.kind in ('routine_started', 'breathing_completed', 'breathing_skipped', 'intention_saved',
                 'intention_skipped', 'routine_finished', 'core_routine_completed')
group by e.device_id, e.day, 3;

-- One row per device that started at least one beta-4 routine.
-- Windows count as complete two days after the day they cover, so every time zone (UTC-12 to UTC+14)
-- has finished that local day before current_date (UTC) says so.
create or replace view public.routine_cohort with (security_invoker = on) as
with dev as (
  select device_id, bool_or(is_test) as is_test, min(day) filter (where started) as first_day
  from public.routine_runs
  group by device_id
),
first_run as (
  select d.device_id, min(r.run) as run
  from dev d join public.routine_runs r on r.device_id = d.device_id and r.day = d.first_day and r.started
  group by d.device_id
),
days as (
  select device_id, day, bool_or(started) as started, bool_or(core_completed) as core
  from public.routine_runs
  group by device_id, day
),
earlier as (
  select distinct device_id from public.events
  where kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view')
)
select
  d.device_id,
  d.first_day,
  d.is_test,
  (x.device_id is not null) as used_earlier_version,
  coalesce(r.finished, false)       as first_routine_finished,
  coalesce(r.core_completed, false) as first_routine_core,
  (d.first_day + 3 <= current_date) as next_day_window_complete,
  exists (select 1 from days n where n.device_id = d.device_id and n.day = d.first_day + 1 and n.started) as returned_next_day,
  (d.first_day + 9 <= current_date) as week_window_complete,
  exists (select 1 from days n where n.device_id = d.device_id and n.day between d.first_day + 1 and d.first_day + 7 and n.core) as repeat_core_within_7d,
  exists (select 1 from days n where n.device_id = d.device_id and n.day = d.first_day + 7 and n.started) as returned_day7,
  -- Home screen: opened from the icon at least once, or Chrome confirmed the install (Android only; iPhones can't tell us)
  exists (select 1 from public.events h where h.device_id = d.device_id and h.data->>'home_screen' = 'true') as used_home_screen,
  exists (select 1 from public.events h where h.device_id = d.device_id
          and (h.kind = 'app_installed' or (h.kind = 'install_prompt' and h.data->>'outcome' = 'accepted'))) as install_confirmed
from dev d
join first_run f on f.device_id = d.device_id
join public.routine_runs r on r.device_id = d.device_id and r.day = d.first_day and r.run = f.run
left join earlier x on x.device_id = d.device_id
where d.first_day is not null;

-- The headline numbers: counts first, then percentages, only over devices whose window is complete.
-- New devices only (no earlier-version history, not test). Earlier-version and test devices are counted separately.
create or replace view public.routine_metrics with (security_invoker = on) as
with c as (select * from public.routine_cohort where not is_test and not used_earlier_version)
select
  (select count(*) from public.routine_cohort where is_test)                            as test_devices_left_out,
  (select count(*) from public.routine_cohort where used_earlier_version and not is_test) as earlier_version_devices_left_out,
  count(*)                                                                               as new_devices,
  count(*) filter (where first_routine_finished)                                         as first_routine_finished,
  round(100.0 * count(*) filter (where first_routine_finished) / nullif(count(*), 0), 1) as pct_first_routine_finished,
  count(*) filter (where first_routine_core)                                             as first_routine_core,
  round(100.0 * count(*) filter (where first_routine_core) / nullif(count(*), 0), 1)     as pct_first_routine_core,
  count(*) filter (where next_day_window_complete)                                       as next_day_eligible,
  count(*) filter (where next_day_window_complete and returned_next_day)                 as returned_next_day,
  round(100.0 * count(*) filter (where next_day_window_complete and returned_next_day)
        / nullif(count(*) filter (where next_day_window_complete), 0), 1)                as pct_returned_next_day,
  count(*) filter (where not next_day_window_complete)                                   as next_day_window_incomplete,
  count(*) filter (where week_window_complete)                                           as week_eligible,
  count(*) filter (where week_window_complete and repeat_core_within_7d)                 as repeat_core_within_7d,
  round(100.0 * count(*) filter (where week_window_complete and repeat_core_within_7d)
        / nullif(count(*) filter (where week_window_complete), 0), 1)                    as pct_repeat_core_within_7d,
  count(*) filter (where week_window_complete and returned_day7)                         as returned_day7,
  round(100.0 * count(*) filter (where week_window_complete and returned_day7)
        / nullif(count(*) filter (where week_window_complete), 0), 1)                    as pct_returned_day7,
  count(*) filter (where not week_window_complete)                                       as week_window_incomplete,
  count(*) filter (where used_home_screen)                                               as used_home_screen,
  round(100.0 * count(*) filter (where used_home_screen) / nullif(count(*), 0), 1)       as pct_used_home_screen,
  count(*) filter (where install_confirmed)                                              as install_confirmed
from c;

-- Per day: routines started, finished and core-completed (first run of each device that day, test devices left out)
create or replace view public.routine_daily with (security_invoker = on) as
select
  day,
  count(*) filter (where started)                                   as devices_started,
  count(*) filter (where breathing_completed)                       as breathing_completed,
  count(*) filter (where breathing_skipped and not breathing_completed) as breathing_skipped,
  count(*) filter (where intention_saved)                           as intention_saved,
  count(*) filter (where intention_skipped and not intention_saved) as intention_skipped,
  count(*) filter (where finished)                                  as finished,
  count(*) filter (where core_completed)                            as core_completed,
  count(*) filter (where home_screen)                               as from_home_screen
from (
  select distinct on (device_id, day) * from public.routine_runs where not is_test order by device_id, day, run
) first_runs
group by day
order by day desc;

revoke all on public.routine_runs, public.routine_cohort, public.routine_metrics, public.routine_daily from anon, authenticated;

commit;
