-- Mornward: anonymous beta stats
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
--
-- What it does:
--   * one table, "events", that the app can only ADD rows to (it can't read, change or delete anything)
--   * size and shape checks so the table can't be filled with junk
--   * read-only views for you. Up to beta-3: daily_mornings, testers, pass_rules, step_stats, onboarding_funnel.
--     From beta-4 (the one-minute routine): routine_runs, routine_cohort, routine_metrics, routine_daily.
--   * excluded_devices: a private list of your own devices to leave out of the beta-4 numbers
-- Nothing personal is stored: a random device id, the day, and counts/choices.

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  device_id   uuid not null,
  day         date not null,
  kind        text not null check (kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view',
                                   'routine_started', 'breathing_completed', 'breathing_skipped', 'intention_saved',
                                   'intention_skipped', 'routine_finished', 'core_routine_completed', 'install_prompt', 'app_installed')),
  data        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2048),
  app_version text check (char_length(app_version) <= 20)
);

-- Tables made before screen_view (beta-3) or the routine kinds (beta-4) existed: widen the allowed kinds (safe to run again)
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view',
              'routine_started', 'breathing_completed', 'breathing_skipped', 'intention_saved',
              'intention_skipped', 'routine_finished', 'core_routine_completed', 'install_prompt', 'app_installed'));

create index if not exists events_device_day on public.events (device_id, day);
create index if not exists events_kind_day on public.events (kind, day);

-- Lock it down, then open exactly one door: the app may insert these columns, nothing else
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant insert (device_id, day, kind, data, app_version) on public.events to anon;

drop policy if exists "App can add anonymous events" on public.events;
create policy "App can add anonymous events" on public.events
  for insert to anon
  with check (day between current_date - 2 and current_date + 2);

-- ---------- Views for you (only visible in your dashboard, not to the app) ----------

-- Per day: how many people started and finished a morning, and how they rated it.
-- People can change their rating, so only each person's latest rating that day counts.
create or replace view public.daily_mornings with (security_invoker = on) as
with latest_rating as (
  select distinct on (device_id, day) day, data->>'value' as value
  from public.events
  where kind = 'rating' and coalesce(data->>'practice', '') <> 'true'
  order by device_id, day, created_at desc
), ratings as (
  select day,
    count(*) filter (where value = 'good') as rated_good,
    count(*) filter (where value = 'ok')   as rated_ok,
    count(*) filter (where value = 'bad')  as rated_bad
  from latest_rating
  group by day
)
select
  e.day,
  count(distinct e.device_id) filter (where e.kind = 'morning_start') as people_started,
  count(distinct e.device_id) filter (where e.kind = 'morning_done')  as people_finished,
  coalesce(r.rated_good, 0) as rated_good,
  coalesce(r.rated_ok, 0)   as rated_ok,
  coalesce(r.rated_bad, 0)  as rated_bad
from public.events e
left join ratings r on r.day = e.day
where coalesce(e.data->>'practice', '') <> 'true'
group by e.day, r.rated_good, r.rated_ok, r.rated_bad
order by e.day desc;

-- Per tester (anonymous device): when they started and how many mornings they finished in weeks 1 and 2
create or replace view public.testers with (security_invoker = on) as
with firsts as (
  select device_id, min(day) as first_day from public.events group by device_id
),
done as (
  select distinct device_id, day from public.events where kind = 'morning_done' and coalesce(data->>'practice', '') <> 'true'
)
select
  f.device_id,
  f.first_day,
  count(d.day) filter (where d.day < f.first_day + 7) as mornings_week1,
  count(d.day) filter (where d.day >= f.first_day + 7 and d.day < f.first_day + 14) as mornings_week2,
  max(d.day) as last_morning,
  (select e.data->>'habit' from public.events e
    where e.device_id = f.device_id and e.kind = 'setup_done'
    order by e.created_at desc limit 1) as habit
from firsts f
left join done d using (device_id)
group by f.device_id, f.first_day
order by f.first_day;

-- Your pass rules at a glance
create or replace view public.pass_rules with (security_invoker = on) as
select
  count(*) as testers,
  round(100.0 * count(*) filter (where mornings_week1 >= 4) / nullif(count(*), 0)) as pct_4_of_first_7_mornings,
  count(*) filter (where first_day <= current_date - 7) as testers_past_week1,
  round(100.0 * count(*) filter (where first_day <= current_date - 7 and mornings_week2 >= 1)
        / nullif(count(*) filter (where first_day <= current_date - 7), 0)) as pct_still_using_week2
from public.testers;

-- Which parts of the morning people use or skip
create or replace view public.step_stats with (security_invoker = on) as
select
  count(*) as mornings_finished,
  round(avg((data->>'minutes')::numeric), 1) as avg_minutes,
  round(100.0 * count(*) filter (where data->>'breathe' = 'skipped') / nullif(count(*), 0)) as pct_skipped_breathing,
  round(100.0 * count(*) filter (where (data->>'reshuffles')::int > 0) / nullif(count(*), 0)) as pct_reshuffled_moves,
  round(100.0 * count(*) filter (where (data->>'own_moves')::boolean) / nullif(count(*), 0)) as pct_own_moves,
  round(100.0 * count(*) filter (where (data->>'intention')::boolean) / nullif(count(*), 0)) as pct_set_intention,
  round(100.0 * count(*) filter (where (data->>'note')::boolean) / nullif(count(*), 0)) as pct_had_a_note,
  round(100.0 * count(*) filter (where (data->>'home_screen')::boolean) / nullif(count(*), 0)) as pct_opened_from_home_screen
from public.events
where kind = 'morning_done' and coalesce(data->>'practice', '') <> 'true';

revoke all on public.daily_mornings, public.testers, public.pass_rules, public.step_stats from anon, authenticated;

-- First-visit funnel: how many new devices reached each onboarding screen, in order.
-- Screens before the terms (welcome, phone-first) only count people who then agreed.
create or replace view public.onboarding_funnel with (security_invoker = on) as
with steps(screen, pos) as (values
  ('view_welcome', 1), ('view_phone_first', 2), ('view_welcome_install_steps', 3), ('view_terms', 4),
  ('view_reset_breathe', 5), ('view_reset_read', 6), ('view_reset_one', 7), ('view_homescreen_prompt', 8),
  ('view_install_steps', 9), ('view_install_prompt', 10), ('view_personalize', 11), ('view_see_you', 12))
select s.pos, s.screen,
       count(distinct e.device_id) as devices,
       min(e.day) as first_day, max(e.day) as last_day
from steps s
left join public.events e on e.kind = 'screen_view' and e.data->>'screen' = s.screen
group by s.pos, s.screen
order by s.pos;

-- ---------- beta-4: the one-minute routine ----------
-- Same as supabase/migrations/20261004000000_intention_routine.sql (kept in step with it).

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
