-- Mornward migration 2026-10-06: setup-first onboarding (app version beta-5)
--
-- Run AFTER 20261005000000_reliability_metrics.sql and BEFORE the app with setup goes live. Until then the database
-- refuses the two setup kinds, and the app drops refused rows (the routine rows still go in).
--
-- Additive: no row is changed or deleted. It
--   1. allows setup_started and setup_completed (every older kind stays allowed)
--   2. extends the payload check: setup_completed.tasks_prepared (0-3) and tasks_saved.prepared (true/false). Setup
--      events carry no answers: never platform names, task text or reminder times.
--   3. adds setup_report: setup participation, completion and setup-to-first-morning conversion, each with its own
--      observation window (definitions: supabase/METRICS.md, "Setup")
-- The beta-2 kind setup_done is a different, older event (with setup answers); it is kept as it was and not reused.
-- Row level security, grants and the insert policy are unchanged. Safe to run more than once.
-- Rollback: supabase/rollback/20261006000000_setup_onboarding.down.sql

begin;

alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view',
  'routine_started', 'breathing_completed', 'breathing_skipped', 'intention_saved', 'intention_skipped',
  'routine_finished', 'core_routine_completed', 'install_prompt', 'app_installed',
  'tasks_saved', 'tasks_skipped', 'reminder_setup',
  -- setup-first onboarding
  'setup_started', 'setup_completed', 'tasks_ticked'));

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
        when 'tasks_saved.prepared'           then jsonb_typeof(v) = 'boolean'
        when 'setup_completed.tasks_prepared' then mornward_private.is_int(v, 0, 3)
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
        when 'tasks_ticked.ticked'            then mornward_private.is_int(v, 1, 3)
        when 'tasks_ticked.total'             then mornward_private.is_int(v, 1, 3)
        else false
      end;
    end if;
    if not coalesce(ok, false) then return false; end if;
  end loop;
  -- tasks_ticked: both numbers, and never more ticked than there are tasks
  if p_kind = 'tasks_ticked' and not (p_data ? 'ticked' and p_data ? 'total'
      and (p_data->>'ticked')::int <= (p_data->>'total')::int) then return false; end if;
  return true;
end
$$;
revoke all on function mornward_private.event_payload_ok(text, jsonb, text) from public;
grant execute on function mornward_private.event_payload_ok(text, jsonb, text) to anon, authenticated;

-- Setup: who started it, who finished it, and whether a first routine followed.
--   day 0 = the local day setup was completed (or started, for the completion metric itself).
--   "First morning by day 1": a first routine on day 0 or day 1. Setting up in the evening and starting the next
--   morning counts; nobody counts as a failure before day 1 is final (day 0 + 4 <= current_date, the same finality
--   rule as retention_report). The time someone means to start isn't sent, so a later intended start (a night-shift
--   worker, a weekend) shows up only in the day-7 rows. Test devices are left out.
drop view if exists public.setup_report;
create view public.setup_report with (security_invoker = on) as
with s as (
  select e.device_id,
    min(e.day) filter (where e.kind = 'setup_started')   as started_day,
    min(e.day) filter (where e.kind = 'setup_completed') as completed_day
  from public.events e
  where e.kind in ('setup_started', 'setup_completed')
    and not exists (select 1 from public.test_devices t where t.device_id = e.device_id)
  group by e.device_id
),
-- the first routine (and first full routine) on or after the day setup finished
r as (
  select s.device_id,
    min(d.day) filter (where d.started) as first_routine, min(d.day) filter (where d.core) as first_core
  from s join public.routine_days d on d.device_id = s.device_id and d.day >= s.completed_day
  group by s.device_id
),
per as (select s.*, r.first_routine, r.first_core from s left join r using (device_id)),
m(ord, metric, definition, base, last_day_offset, hit) as (
  select 1, 'setup_completed_7d', 'finished setup within 7 days of starting it', started_day, 7,
    completed_day is not null and completed_day <= started_day + 7 from per where started_day is not null union all
  select 2, 'first_routine_by_day1', 'after finishing setup, started a first routine on day 0 or day 1', completed_day, 1,
    first_routine is not null and first_routine <= completed_day + 1 from per where completed_day is not null union all
  select 3, 'first_routine_by_day7', 'after finishing setup, started a first routine by day 7', completed_day, 7,
    first_routine is not null and first_routine <= completed_day + 7 from per where completed_day is not null union all
  select 4, 'first_full_by_day7', 'after finishing setup, a first full routine (3 breaths + tasks saved) by day 7', completed_day, 7,
    first_core is not null and first_core <= completed_day + 7 from per where completed_day is not null
)
select ord, metric, definition,
  'day 0 + ' || last_day_offset || ' final (day 0 + ' || (last_day_offset + 3) || ' <= current_date UTC)' as window_rule,
  count(*) filter (where base + last_day_offset + 3 <= current_date and hit) as numerator,
  count(*) filter (where base + last_day_offset + 3 <= current_date)         as denominator,
  round(100.0 * count(*) filter (where base + last_day_offset + 3 <= current_date and hit)
        / nullif(count(*) filter (where base + last_day_offset + 3 <= current_date), 0), 1) as pct,
  count(*) filter (where base + last_day_offset + 3 > current_date) as not_yet_eligible
from m
group by ord, metric, definition, last_day_offset
order by ord;
revoke all on public.setup_report from anon, authenticated;

commit;
