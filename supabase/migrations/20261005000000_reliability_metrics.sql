-- Mornward migration 2026-10-05: reliability and measurement (app version beta-5)
--
-- Run AFTER 20261004000000_intention_routine.sql, and BEFORE the beta-5 app goes live: beta-5 sends an event_id
-- column and asks the database to ignore event_ids it already has. Without this migration every beta-5 row is
-- rejected (and the app drops rejected rows).
--
-- Additive for data: no row is changed or deleted. It
--   1. adds events.event_id (nullable; older rows keep NULL) with a unique index, so a re-sent row is stored once
--   2. allows the beta-5 kinds tasks_saved, tasks_skipped, reminder_setup (every older kind stays allowed)
--   3. checks the shape of NEW rows' data (allowed keys and value types per kind), so free text can't be sent in.
--      Existing rows are not checked (NOT VALID), so nothing already stored is touched.
--   4. replaces the dashboard views from 20261004 with versions that state their cohort, window and denominator
--      (definitions: supabase/METRICS.md). Views hold no data; dropping and re-creating them loses nothing.
-- Row level security stays on; the insert policy is unchanged; the app's key still can't read anything.
-- Rollback: supabase/rollback/20261005000000_reliability_metrics.down.sql
-- Safe to run more than once.

begin;

-- Helpers live here, out of the API: PostgREST only serves the public schema.
create schema if not exists mornward_private;
revoke all on schema mornward_private from public;
grant usage on schema mornward_private to anon, authenticated;

-- 1. Event IDs ------------------------------------------------------------------------------------------------
alter table public.events add column if not exists event_id uuid;
-- The unique index is the guarantee: one row per event_id (NULLs, from older app versions, don't collide).
create unique index if not exists events_event_id_key on public.events (event_id);
grant insert (event_id) on public.events to anon;
-- A re-sent row (its first send arrived, the reply didn't) is skipped quietly instead of failing the whole batch.
-- ON CONFLICT DO NOTHING isn't used: under row level security it needs a SELECT policy, which would let the app's
-- key read rows. This trigger checks as the table owner (security definer), so the key still reads nothing.
-- Two copies arriving at the same instant still meet the unique index: one is stored, the other gets 409, which
-- the app treats as sent.
create or replace function mornward_private.events_skip_duplicate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_id is not null and exists (select 1 from public.events e where e.event_id = new.event_id) then
    return null;
  end if;
  return new;
end
$$;
revoke all on function mornward_private.events_skip_duplicate() from public, anon, authenticated;
drop trigger if exists events_skip_duplicate on public.events;
create trigger events_skip_duplicate before insert on public.events
  for each row execute function mornward_private.events_skip_duplicate();

-- 2. Kinds ------------------------------------------------------------------------------------------------------
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  -- up to beta-3
  'morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view',
  -- beta-4 (intention_* were renamed tasks_* in beta-5; kept so a cached beta-4 page can still send)
  'routine_started', 'breathing_completed', 'breathing_skipped', 'intention_saved', 'intention_skipped',
  'routine_finished', 'core_routine_completed', 'install_prompt', 'app_installed',
  -- beta-5
  'tasks_saved', 'tasks_skipped', 'reminder_setup'));

-- 3. Payload shape ------------------------------------------------------------------------------------------------

-- Short identifier strings only: lowercase letters, digits, "_" and "-" (no spaces, so no sentences)
create or replace function mornward_private.is_slug(v jsonb, max_len int default 40) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'string' and (v #>> '{}') ~ ('^[a-z0-9_-]{1,' || max_len || '}$')
$$;
create or replace function mornward_private.is_int(v jsonb, lo bigint, hi bigint) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'number' and (v #>> '{}') ~ '^[0-9]{1,9}$' and (v #>> '{}')::bigint between lo and hi
$$;
create or replace function mornward_private.is_one_of(v jsonb, allowed text[]) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'string' and (v #>> '{}') = any (allowed)
$$;

-- true when a row's data matches what some app version sends for that kind.
--   beta-4 / beta-5 kinds: an exact list of keys and values.
--   Older kinds (still sent by the live beta-2 app until beta-5 replaces it): any lowercase key, with values that are
--   booleans, small whole numbers, null, short identifiers, or lists of short identifiers. No free text.
create or replace function mornward_private.event_payload_ok(p_kind text, p_data jsonb, p_version text) returns boolean
language plpgsql immutable as $$
declare
  k text;
  v jsonb;
  ok boolean;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then return false; end if;
  if p_version is not null and p_version !~ '^[a-z0-9.-]{1,20}$' then return false; end if;
  for k, v in select * from jsonb_each(p_data) loop
    -- keys every kind may carry
    if k = 'run' then ok := mornward_private.is_int(v, 0, 9999);
    elsif k = 'rid' then ok := jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9a-f]{8}$';
    elsif k in ('home_screen', 'test') then ok := jsonb_typeof(v) = 'boolean';
    elsif p_kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view') then
      ok := k ~ '^[a-z][a-z0-9_]{0,29}$' and (
        jsonb_typeof(v) in ('boolean', 'null')
        or mornward_private.is_int(v, 0, 1000000)
        or mornward_private.is_slug(v)
        or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= 40
            and not exists (select 1 from jsonb_array_elements(v) e where not mornward_private.is_slug(e))));
    else
      ok := case p_kind || '.' || k
        when 'routine_started.first'          then jsonb_typeof(v) = 'boolean'
        when 'routine_started.from'           then jsonb_typeof(v) = 'null' or mornward_private.is_slug(v, 20)
        when 'routine_started.via'            then mornward_private.is_one_of(v, array['calendar', 'alarm'])
        when 'breathing_skipped.breaths_done' then mornward_private.is_int(v, 0, 3)
        when 'tasks_saved.count'              then mornward_private.is_int(v, 1, 3)
        when 'tasks_saved.kept_defaults'      then jsonb_typeof(v) = 'boolean'
        when 'tasks_saved.own'                then jsonb_typeof(v) = 'boolean'
        when 'intention_saved.count'          then mornward_private.is_int(v, 1, 3)
        when 'intention_saved.kept_defaults'  then jsonb_typeof(v) = 'boolean'
        when 'intention_saved.own'            then jsonb_typeof(v) = 'boolean'
        when 'tasks_skipped.had_earlier'      then jsonb_typeof(v) = 'boolean'
        when 'routine_finished.breathing'     then mornward_private.is_one_of(v, array['completed', 'skipped'])
        when 'routine_finished.tasks'         then mornward_private.is_one_of(v, array['saved', 'skipped'])
        when 'routine_finished.intention'     then mornward_private.is_one_of(v, array['saved', 'skipped'])
        when 'routine_finished.core'          then jsonb_typeof(v) = 'boolean'
        when 'routine_finished.def'           then mornward_private.is_int(v, 1, 99)
        when 'routine_finished.seconds'       then mornward_private.is_int(v, 0, 10000000)
        when 'core_routine_completed.def'     then mornward_private.is_int(v, 1, 99)
        when 'install_prompt.outcome'         then mornward_private.is_one_of(v, array['accepted', 'dismissed'])
        when 'reminder_setup.action'          then mornward_private.is_one_of(v, array['google_link', 'calendar_file', 'shortcut_link'])
        else false
      end;
    end if;
    if not coalesce(ok, false) then return false; end if;
  end loop;
  return true;
end
$$;
revoke all on function mornward_private.is_slug(jsonb, int), mornward_private.is_int(jsonb, bigint, bigint),
  mornward_private.is_one_of(jsonb, text[]), mornward_private.event_payload_ok(text, jsonb, text) from public;
grant execute on function mornward_private.is_slug(jsonb, int), mornward_private.is_int(jsonb, bigint, bigint),
  mornward_private.is_one_of(jsonb, text[]), mornward_private.event_payload_ok(text, jsonb, text) to anon, authenticated;

alter table public.events drop constraint if exists events_payload_ok;
alter table public.events add constraint events_payload_ok
  check (mornward_private.event_payload_ok(kind, data, app_version)) not valid;

-- 4. Views (dashboard only; definitions in supabase/METRICS.md) --------------------------------------------------
drop view if exists public.routine_metrics, public.routine_daily, public.routine_cohort, public.routine_runs,
  public.retention_report, public.week1_frequency, public.report_exclusions, public.legacy_retention_report,
  public.routine_days, public.report_devices, public.test_devices cascade;

-- Devices left out of every report: any row with test: true (opened once with ?test=1), or listed in excluded_devices
create view public.test_devices with (security_invoker = on) as
select distinct device_id from public.events where data->>'test' = 'true'
union
select device_id from public.excluded_devices;

-- One row per routine. A routine is (device, local day it started, rid); rows without rid (beta-4) use the run number.
-- bool_or: a row that arrived twice counts once.
create view public.routine_runs with (security_invoker = on) as
select
  e.device_id,
  e.day,
  coalesce(e.data->>'rid', 'run-' || coalesce(e.data->>'run', '1')) as run_key,
  min(case when e.data->>'run' ~ '^[0-9]{1,4}$' then (e.data->>'run')::int end) as run,
  bool_or(e.kind = 'routine_started')                               as started,
  bool_or(e.kind = 'breathing_completed')                           as breathing_completed,
  bool_or(e.kind = 'breathing_skipped')                             as breathing_skipped,
  bool_or(e.kind in ('tasks_saved', 'intention_saved'))             as tasks_saved,
  bool_or(e.kind in ('tasks_skipped', 'intention_skipped'))         as tasks_skipped,
  bool_or(e.kind = 'routine_finished')                              as finished,
  -- definition 2 (beta-5): three breaths AND tasks saved in the routine's own task step
  bool_or(e.kind = 'core_routine_completed' and e.data->>'def' = '2') as core_completed,
  -- beta-4 rows (no def) used an earlier rule (an edit after Finish could count); reported, never merged
  bool_or(e.kind = 'core_routine_completed' and e.data->>'def' is null) as core_completed_def1,
  coalesce(bool_or(e.data->>'first' = 'true'), false)               as marked_first,
  max(e.data->>'from')                                              as link_from,
  max(e.data->>'via')                                               as via,
  coalesce(bool_or(e.data->>'home_screen' = 'true'), false)         as home_screen,
  min(e.app_version)                                                as app_version,
  min(e.created_at)                                                 as first_seen
from public.events e
where e.kind in ('routine_started', 'breathing_completed', 'breathing_skipped', 'tasks_saved', 'intention_saved',
                 'tasks_skipped', 'intention_skipped', 'routine_finished', 'core_routine_completed')
group by 1, 2, 3;

-- One row per device per local day: however many routines, a day counts once
create view public.routine_days with (security_invoker = on) as
select device_id, day,
  bool_or(started) as started, bool_or(finished) as finished, bool_or(core_completed) as core,
  count(distinct run_key) filter (where started) as routines
from public.routine_runs
group by device_id, day;

-- One row per device that started a beta-4+ routine, with its cohort days and why it may be left out
create view public.routine_cohort with (security_invoker = on) as
with firsts as (
  select device_id, min(day) filter (where started) as first_day, min(day) filter (where core) as activation_day
  from public.routine_days group by device_id
),
first_run as (
  select distinct on (r.device_id) r.device_id, r.marked_first, r.via, r.finished, r.core_completed
  from public.routine_runs r join firsts f on f.device_id = r.device_id and r.day = f.first_day and r.started
  -- the run the app marked first, whatever order rows arrived in (a queue sent later can arrive out of order)
  order by r.device_id, r.marked_first desc, r.first_seen
)
select
  f.device_id,
  f.first_day,
  f.activation_day,
  (t.device_id is not null) as is_test,
  exists (select 1 from public.events x where x.device_id = f.device_id
          and x.kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view')) as used_earlier_version,
  coalesce(fr.marked_first, false) as first_routine_marked_first,
  fr.via as first_routine_via,
  -- In the acquisition cohort: a real first visit we were allowed to count. Left out: test devices, people who used
  -- an earlier version, routines that weren't the device's first (counts were off before, or storage was cleared),
  -- and a first routine opened from a reminder (a returning person in a browser that doesn't share storage).
  (t.device_id is null
    and not exists (select 1 from public.events x where x.device_id = f.device_id
          and x.kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view'))
    and coalesce(fr.marked_first, false) and fr.via is null) as in_acquisition_cohort,
  coalesce(fr.finished, false) as first_routine_finished,
  coalesce(fr.core_completed, false) as first_routine_core,
  exists (select 1 from public.events h where h.device_id = f.device_id and h.data->>'home_screen' = 'true') as used_home_screen,
  exists (select 1 from public.events h where h.device_id = f.device_id and h.kind = 'install_prompt' and h.data->>'outcome' = 'accepted') as install_accepted,
  exists (select 1 from public.events h where h.device_id = f.device_id and h.kind = 'app_installed') as install_confirmed
from firsts f
left join first_run fr on fr.device_id = f.device_id
left join public.test_devices t on t.device_id = f.device_id
where f.first_day is not null;

-- The retention report: one row per metric, with its cohort, numerator, denominator and how many devices are still
-- inside their window. A local day D is final once current_date (UTC) >= D + 3: by then that day has ended in every
-- time zone and the database no longer accepts rows dated D (the insert policy allows current_date - 2 at most).
create view public.retention_report with (security_invoker = on) as
with c as (select * from public.routine_cohort where in_acquisition_cohort),
d as (select * from public.routine_days),
per as (
  select c.device_id, c.first_day as d0, c.activation_day as a0,
    -- acquisition cohort (day 0 = first routine)
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.first_day and d.finished)  as acq_d0_finished,
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.first_day and d.core)      as acq_d0_core,
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.first_day + 1 and d.started) as acq_d1_return,
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.first_day + 1 and d.core)  as acq_d1_core,
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.first_day + 7 and d.started) as acq_d7_return,
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.first_day + 7 and d.core)  as acq_d7_core,
    (select count(*) from d where d.device_id = c.device_id and d.started and d.day between c.first_day and c.first_day + 6) as acq_week1_days,
    exists (select 1 from d where d.device_id = c.device_id and d.core and d.day between c.first_day + 1 and c.first_day + 7) as acq_repeat_core_7d,
    -- activation cohort (day 0 = first full routine)
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.activation_day + 1 and d.started) as act_d1_return,
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.activation_day + 1 and d.core)  as act_d1_core,
    exists (select 1 from d where d.device_id = c.device_id and d.day = c.activation_day + 7 and d.started) as act_d7_return,
    exists (select 1 from d where d.device_id = c.device_id and d.core and d.day between c.activation_day + 1 and c.activation_day + 7) as act_repeat_core_7d,
    (select count(*) from d where d.device_id = c.device_id and d.started and d.day between c.activation_day and c.activation_day + 6) as act_week1_days
  from c
),
m(ord, cohort, metric, definition, last_day_offset, base, hit) as (
  select 1, 'acquisition', 'first_day_finished', 'reached the end of a routine on day 0', 0, d0, acq_d0_finished from per union all
  select 2, 'acquisition', 'first_day_core', 'full routine (3 breaths + tasks saved) on day 0', 0, d0, acq_d0_core from per union all
  select 3, 'acquisition', 'd1_return', 'started a routine on day 1 (next local calendar day)', 1, d0, acq_d1_return from per union all
  select 4, 'acquisition', 'd1_core', 'full routine on day 1', 1, d0, acq_d1_core from per union all
  select 5, 'acquisition', 'd7_return', 'started a routine on day 7 exactly', 7, d0, acq_d7_return from per union all
  select 6, 'acquisition', 'd7_core', 'full routine on day 7 exactly', 7, d0, acq_d7_core from per union all
  select 7, 'acquisition', 'week1_3plus_days', 'started a routine on 3+ distinct days of days 0-6', 6, d0, acq_week1_days >= 3 from per union all
  select 8, 'acquisition', 'repeat_core_7d', 'full routine on any of days 1-7', 7, d0, acq_repeat_core_7d from per union all
  select 9, 'activation', 'd1_return', 'started a routine the day after the first full routine', 1, a0, act_d1_return from per where a0 is not null union all
  select 10, 'activation', 'd1_core', 'full routine the day after the first full routine', 1, a0, act_d1_core from per where a0 is not null union all
  select 11, 'activation', 'd7_return', 'started a routine 7 days after the first full routine', 7, a0, act_d7_return from per where a0 is not null union all
  select 12, 'activation', 'week1_3plus_days', 'started a routine on 3+ distinct days of days 0-6 after the first full routine', 6, a0, act_week1_days >= 3 from per where a0 is not null union all
  select 13, 'activation', 'repeat_core_7d', 'another full routine within days 1-7 after the first', 7, a0, act_repeat_core_7d from per where a0 is not null
)
select ord, cohort, metric, definition,
  'day 0 + ' || last_day_offset || ' final (day 0 + ' || (last_day_offset + 3) || ' <= current_date UTC)' as window_rule,
  count(*) filter (where base + last_day_offset + 3 <= current_date and hit) as numerator,
  count(*) filter (where base + last_day_offset + 3 <= current_date)         as denominator,
  round(100.0 * count(*) filter (where base + last_day_offset + 3 <= current_date and hit)
        / nullif(count(*) filter (where base + last_day_offset + 3 <= current_date), 0), 1) as pct,
  count(*) filter (where base + last_day_offset + 3 > current_date)          as not_yet_eligible
from m
group by ord, cohort, metric, definition, last_day_offset
order by ord;

-- First-week frequency for the acquisition cohort: how many devices started a routine on 1, 2, ... 7 distinct
-- days of days 0-6. Only devices whose day 6 is final.
create view public.week1_frequency with (security_invoker = on) as
select active_days, count(*) as devices
from (
  select c.device_id, (select count(*) from public.routine_days d
                       where d.device_id = c.device_id and d.started and d.day between c.first_day and c.first_day + 6) as active_days
  from public.routine_cohort c
  where c.in_acquisition_cohort and c.first_day + 9 <= current_date
) x
group by active_days
order by active_days;

-- Who is left out of the report, and why (each device once, first matching reason)
create view public.report_exclusions with (security_invoker = on) as
select reason, count(*) as devices from (
  select case
    when is_test then 'test device (?test=1 or excluded_devices)'
    when used_earlier_version then 'used an earlier version (not new)'
    when first_routine_via is not null then 'first counted routine opened from a reminder (separate browser storage)'
    when not first_routine_marked_first then 'first counted routine was not the device''s first (counts were off, or carried in)'
    else 'in the acquisition cohort' end as reason
  from public.routine_cohort
) x group by reason order by devices desc;

-- Per local day: devices that started, finished, did the full routine (each device once per day, test devices out)
create view public.routine_daily with (security_invoker = on) as
select d.day,
  count(*) filter (where d.started)  as devices_started,
  count(*) filter (where d.finished) as devices_finished,
  count(*) filter (where d.core)     as devices_core,
  sum(d.routines)                    as routines_started
from public.routine_days d
where not exists (select 1 from public.test_devices t where t.device_id = d.device_id)
group by d.day
order by d.day desc;

-- The beta-2 app (live until beta-5 ships), measured the same way, in its own report so the two are never mixed.
-- Day 0 = the device's first event of any kind (beta-2 sends nothing before setup is agreed).
-- Return = a non-practice morning_start; core = a non-practice morning_done. Excluded: excluded_devices.
create view public.legacy_retention_report with (security_invoker = on) as
with ev as (
  select e.device_id, e.day, e.kind, coalesce(e.data->>'practice', '') = 'true' as practice
  from public.events e
  where e.kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view')
    and not exists (select 1 from public.test_devices t where t.device_id = e.device_id)
),
c as (select device_id, min(day) as d0 from ev group by device_id),
per as (
  select c.device_id, c.d0,
    exists (select 1 from ev where ev.device_id = c.device_id and ev.day = c.d0 and ev.kind = 'morning_done' and not ev.practice) as d0_core,
    exists (select 1 from ev where ev.device_id = c.device_id and ev.day = c.d0 + 1 and ev.kind = 'morning_start' and not ev.practice) as d1_return,
    exists (select 1 from ev where ev.device_id = c.device_id and ev.day = c.d0 + 1 and ev.kind = 'morning_done' and not ev.practice) as d1_core,
    exists (select 1 from ev where ev.device_id = c.device_id and ev.day = c.d0 + 7 and ev.kind = 'morning_start' and not ev.practice) as d7_return,
    exists (select 1 from ev where ev.device_id = c.device_id and ev.day > c.d0 and ev.day <= c.d0 + 7) as any_return_7d,
    (select count(distinct day) from ev where ev.device_id = c.device_id and ev.kind = 'morning_start' and not ev.practice
       and ev.day between c.d0 and c.d0 + 6) as week1_days
  from c
),
m(ord, metric, definition, last_day_offset, hit, d0) as (
  select 1, 'first_day_real_morning', 'finished a non-practice morning on day 0', 0, d0_core, d0 from per union all
  select 2, 'd1_return', 'started a non-practice morning on day 1', 1, d1_return, d0 from per union all
  select 3, 'd1_core', 'finished a non-practice morning on day 1', 1, d1_core, d0 from per union all
  select 4, 'd7_return', 'started a non-practice morning on day 7 exactly', 7, d7_return, d0 from per union all
  select 5, 'any_visit_days_1_7', 'sent any event on days 1-7', 7, any_return_7d, d0 from per union all
  select 6, 'week1_3plus_days', 'started non-practice mornings on 3+ distinct days of days 0-6', 6, week1_days >= 3, d0 from per
)
select ord, 'legacy beta-2 (first event)' as cohort, metric, definition,
  'day 0 + ' || last_day_offset || ' final (day 0 + ' || (last_day_offset + 3) || ' <= current_date UTC)' as window_rule,
  count(*) filter (where d0 + last_day_offset + 3 <= current_date and hit) as numerator,
  count(*) filter (where d0 + last_day_offset + 3 <= current_date)         as denominator,
  round(100.0 * count(*) filter (where d0 + last_day_offset + 3 <= current_date and hit)
        / nullif(count(*) filter (where d0 + last_day_offset + 3 <= current_date), 0), 1) as pct,
  count(*) filter (where d0 + last_day_offset + 3 > current_date) as not_yet_eligible
from m
group by ord, metric, definition, last_day_offset
order by ord;

revoke all on public.test_devices, public.routine_runs, public.routine_days, public.routine_cohort, public.retention_report,
  public.week1_frequency, public.report_exclusions, public.routine_daily, public.legacy_retention_report from anon, authenticated;

commit;
