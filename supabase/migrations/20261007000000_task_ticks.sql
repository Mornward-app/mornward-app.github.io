-- Mornward migration 2026-10-07: ticking mini tasks off, and the reminder fix in routine_cohort (app version beta-5)
--
-- Run AFTER 20261006000000_setup_onboarding.sql and BEFORE the app that sends tasks_ticked goes live. Until then the
-- database refuses tasks_ticked rows, and the app drops refused rows (every other row still goes in).
--
-- Additive: no row is changed or deleted. It
--   1. allows tasks_ticked: how many of the day's mini tasks were ticked as done, out of how many. Numbers only
--      (ticked 1-3, total 1-3, ticked <= total), never which task or its words. The app sends one row each time the
--      day's highest number ticked goes up, so a report reads the highest number reached (max) per device and day.
--   2. fixes routine_cohort: a first routine opened from a reminder was always left out of the acquisition cohort
--      ("a returning person in a browser that doesn't share storage"). With setup first, the first routine is meant
--      to be opened from the reminder, so those testers were wrongly dropped. It's now left out only when the device
--      has no setup of its own (no setup_started or setup_completed under the same ID). A setup carried into another
--      browser (#r=) keeps its ID, so it counts. Adds the column set_up_here (at the end) and updates
--      report_exclusions to match.
--   3. adds task_ticks: per device and local day, the highest number ticked and of how many (test devices out), and
--      task_ticks_report: per local day, devices that ticked at least one, and all of them.
-- Row level security, grants and the insert policy are unchanged. Safe to run more than once.
-- Rollback: supabase/rollback/20261007000000_task_ticks.down.sql

begin;

alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view',
  'routine_started', 'breathing_completed', 'breathing_skipped', 'intention_saved', 'intention_skipped',
  'routine_finished', 'core_routine_completed', 'install_prompt', 'app_installed',
  'tasks_saved', 'tasks_skipped', 'reminder_setup',
  'setup_started', 'setup_completed',
  -- mini tasks ticked as done (numbers only)
  'tasks_ticked'));

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

-- The acquisition cohort, with the reminder rule fixed (see 2. above). Same columns as before, set_up_here added last,
-- so the views built on it (retention_report, week1_frequency, report_exclusions) keep working.
create or replace view public.routine_cohort with (security_invoker = on) as
with firsts as (
  select device_id, min(day) filter (where started) as first_day, min(day) filter (where core) as activation_day
  from public.routine_days group by device_id
),
first_run as (
  select distinct on (r.device_id) r.device_id, r.marked_first, r.via, r.finished, r.core_completed
  from public.routine_runs r join firsts f on f.device_id = r.device_id and r.day = f.first_day and r.started
  -- the run the app marked first, whatever order rows arrived in (a queue sent later can arrive out of order)
  order by r.device_id, r.marked_first desc, r.first_seen
),
setups as (
  select distinct device_id from public.events where kind in ('setup_started', 'setup_completed')
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
  -- and a first routine opened from a reminder on a device with no setup of its own (a returning person in a
  -- browser that doesn't share storage). Opened from the reminder after setting up on the same ID: counted.
  (t.device_id is null
    and not exists (select 1 from public.events x where x.device_id = f.device_id
          and x.kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view'))
    and coalesce(fr.marked_first, false) and (fr.via is null or s.device_id is not null)) as in_acquisition_cohort,
  coalesce(fr.finished, false) as first_routine_finished,
  coalesce(fr.core_completed, false) as first_routine_core,
  exists (select 1 from public.events h where h.device_id = f.device_id and h.data->>'home_screen' = 'true') as used_home_screen,
  exists (select 1 from public.events h where h.device_id = f.device_id and h.kind = 'install_prompt' and h.data->>'outcome' = 'accepted') as install_accepted,
  exists (select 1 from public.events h where h.device_id = f.device_id and h.kind = 'app_installed') as install_confirmed,
  (s.device_id is not null) as set_up_here
from firsts f
left join first_run fr on fr.device_id = f.device_id
left join public.test_devices t on t.device_id = f.device_id
left join setups s on s.device_id = f.device_id
where f.first_day is not null;

create or replace view public.report_exclusions with (security_invoker = on) as
select reason, count(*) as devices from (
  select case
    when is_test then 'test device (?test=1 or excluded_devices)'
    when used_earlier_version then 'used an earlier version (not new)'
    when first_routine_via is not null and not set_up_here then 'first counted routine opened from a reminder, with no setup on this ID (separate browser storage)'
    when not first_routine_marked_first then 'first counted routine was not the device''s first (counts were off, or carried in)'
    else 'in the acquisition cohort' end as reason
  from public.routine_cohort
) x group by reason order by devices desc;

-- Mini tasks ticked as done: per device and local day, the highest number reached (rows arrive once per new high)
drop view if exists public.task_ticks_report;
drop view if exists public.task_ticks;
create view public.task_ticks with (security_invoker = on) as
select e.device_id, e.day,
  max((e.data->>'ticked')::int) as ticked,
  max((e.data->>'total')::int)  as total
from public.events e
where e.kind = 'tasks_ticked' and not exists (select 1 from public.test_devices t where t.device_id = e.device_id)
group by e.device_id, e.day;

-- Per local day: devices that saved mini tasks in a routine, how many of them ticked at least one, and all of them
create view public.task_ticks_report with (security_invoker = on) as
with saved as (
  select distinct r.device_id, r.day from public.routine_runs r
  where r.tasks_saved and not exists (select 1 from public.test_devices t where t.device_id = r.device_id)
)
select s.day,
  count(*)                                              as devices_saved_tasks,
  count(k.device_id)                                    as ticked_at_least_one,
  count(k.device_id) filter (where k.ticked = k.total)  as ticked_all
from saved s
left join public.task_ticks k on k.device_id = s.device_id and k.day = s.day
group by s.day
order by s.day desc;

revoke all on public.routine_cohort, public.report_exclusions, public.task_ticks, public.task_ticks_report from anon, authenticated;

commit;
