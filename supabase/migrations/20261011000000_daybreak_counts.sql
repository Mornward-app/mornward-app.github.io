-- Mornward migration 2026-10-11: anonymous counts for the Daybreak app (React/Capacitor, app version daybreak-1)
--
-- Run BEFORE the app that sends these rows goes live. Until then the database refuses them and the app drops refused
-- rows. Additive and safe to run more than once: no row is changed or deleted; row level security, grants and the
-- insert-only policy (rows dated within two days of today) are unchanged.
--
--   1. allows the Daybreak kinds (numbers and yes/no flags only, never words):
--        app_opened         once a day: platform (ios/android/web), the screen it opened on, onboarded yes/no
--        evening_set        "Set my morning": tasks picked 0-3, own task yes/no, note sealed yes/no, reminder on yes/no
--        sun_hold_done      all three 3.2 s sun holds done (breaths = 3)
--        breaths_skipped    Skip breathing, after how many holds (0-2)
--        morning_completed  every task ticked: tasks 1-3, breathing held/skipped, streak (days in a row), sunrises (total)
--        card_opened        the day's card unsealed
--        history_synced     once, for people who finished mornings before counts existed: the dates of those mornings
--                           (up to 60 'YYYY-MM-DD'), their total, streak and onboarded yes/no. The policy only takes rows
--                           dated within two days, so past mornings travel as a list in today's row.
--   2. also allows tasks_ticked (migration 20261007000000_task_ticks.sql never reached production; its kind and payload
--      rules are folded in here). Run order matters: migrations 005-007 each define an older payload check, so never run
--      any of them after this one (they would put that older check back and the app's new rows would be refused). If
--      you want 007's reports (task_ticks), run 007 first, then this file again.
--   3. adds the reports: daybreak_testers (one row per device), daybreak_daily (per local day) and daybreak_retention.
--      Test devices (test: true, or listed in excluded_devices) are left out of all three.
-- Rollback: supabase/rollback/20261011000000_daybreak_counts.down.sql

begin;

alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'morning_start', 'morning_done', 'setup_done', 'rating', 'door_open', 'screen_view',
  'routine_started', 'breathing_completed', 'breathing_skipped', 'intention_saved', 'intention_skipped',
  'routine_finished', 'core_routine_completed', 'install_prompt', 'app_installed',
  'tasks_saved', 'tasks_skipped', 'reminder_setup',
  'setup_started', 'setup_completed',
  'tasks_ticked',
  -- Daybreak (daybreak-1)
  'app_opened', 'evening_set', 'sun_hold_done', 'breaths_skipped', 'morning_completed', 'card_opened', 'history_synced'));

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
        -- Daybreak
        when 'app_opened.platform'            then mornward_private.is_one_of(v, array['ios', 'android', 'web'])
        when 'app_opened.screen'              then mornward_private.is_one_of(v, array['welcome', 'plan', 'pact', 'hook', 'sleep', 'wake', 'breathe', 'act', 'down', 'rest'])
        when 'app_opened.onboarded'           then jsonb_typeof(v) = 'boolean'
        when 'evening_set.tasks'              then mornward_private.is_int(v, 0, 3)
        when 'evening_set.own'                then jsonb_typeof(v) = 'boolean'
        when 'evening_set.pact'               then jsonb_typeof(v) = 'boolean'
        when 'evening_set.push'               then jsonb_typeof(v) = 'boolean'
        when 'sun_hold_done.breaths'          then mornward_private.is_int(v, 3, 3)
        when 'breaths_skipped.held'           then mornward_private.is_int(v, 0, 2)
        when 'morning_completed.tasks'        then mornward_private.is_int(v, 1, 3)
        when 'morning_completed.breathing'    then mornward_private.is_one_of(v, array['held', 'skipped'])
        when 'morning_completed.streak'       then mornward_private.is_int(v, 1, 10000)
        when 'morning_completed.sunrises'     then mornward_private.is_int(v, 1, 100000)
        when 'history_synced.sunrises'        then mornward_private.is_int(v, 0, 100000)
        when 'history_synced.streak'          then mornward_private.is_int(v, 0, 10000)
        when 'history_synced.onboarded'       then jsonb_typeof(v) = 'boolean'
        when 'history_synced.days'            then jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= 60
          and not exists (select 1 from jsonb_array_elements(v) e
                          where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^20[0-9]{2}-[01][0-9]-[0-3][0-9]$')
        else false
      end;
    end if;
    if not coalesce(ok, false) then return false; end if;
  end loop;
  -- tasks_ticked: both numbers, and never more ticked than there are tasks
  if p_kind = 'tasks_ticked' and not (p_data ? 'ticked' and p_data ? 'total'
      and (p_data->>'ticked')::int <= (p_data->>'total')::int) then return false; end if;
  -- morning_completed: all four, and a streak can't be longer than the total
  if p_kind = 'morning_completed' and not (p_data ?& array['tasks', 'breathing', 'streak', 'sunrises']
      and (p_data->>'streak')::int <= (p_data->>'sunrises')::int) then return false; end if;
  if p_kind = 'sun_hold_done' and not (p_data ? 'breaths') then return false; end if;
  if p_kind = 'history_synced' and not (p_data ? 'days' and p_data ? 'sunrises') then return false; end if;
  return true;
end
$$;
revoke all on function mornward_private.event_payload_ok(text, jsonb, text) from public;
grant execute on function mornward_private.event_payload_ok(text, jsonb, text) to anon, authenticated;

-- ---------- reports ----------
-- Every Daybreak row from a device that isn't a test device
create or replace view public.daybreak_events with (security_invoker = on) as
select e.*
from public.events e
where e.kind in ('app_opened', 'evening_set', 'sun_hold_done', 'breaths_skipped', 'morning_completed', 'card_opened', 'history_synced')
  and not exists (select 1 from public.test_devices t where t.device_id = e.device_id);

-- Finished mornings per device and local day: the live ones, plus the dates carried in by history_synced
create or replace view public.daybreak_mornings with (security_invoker = on) as
select device_id, day, false as from_history from public.daybreak_events where kind = 'morning_completed'
union
select e.device_id, (d #>> '{}')::date, true
from public.daybreak_events e, jsonb_array_elements(e.data->'days') d
where e.kind = 'history_synced'
  and not exists (select 1 from public.daybreak_events m where m.device_id = e.device_id and m.kind = 'morning_completed'
                  and m.day = (d #>> '{}')::date);

-- One row per device: where it stands
create or replace view public.daybreak_testers with (security_invoker = on) as
with ev as (select * from public.daybreak_events),
mornings as (select device_id, count(distinct day) as mornings, min(day) as first_morning, max(day) as last_morning,
             count(*) filter (where from_history) as from_history from public.daybreak_mornings group by device_id)
select ev.device_id,
  least(min(ev.day), min(m.first_morning))                                     as first_day,
  max(ev.day)                                                                  as last_day,
  (array_agg(ev.data->>'platform' order by ev.created_at desc) filter (where ev.kind = 'app_opened'))[1] as platform,
  count(distinct ev.day) filter (where ev.kind = 'app_opened')                 as days_opened,
  count(distinct ev.day) filter (where ev.kind = 'evening_set')                as evenings_set,
  count(distinct ev.day) filter (where ev.kind = 'sun_hold_done')              as sun_holds,
  count(distinct ev.day) filter (where ev.kind = 'breaths_skipped')            as breaths_skipped,
  coalesce(max(m.mornings), 0)                                                 as mornings_completed,
  coalesce(max(m.from_history), 0)                                             as mornings_before_counts,
  max((ev.data->>'streak')::int) filter (where ev.kind in ('morning_completed', 'history_synced')) as best_streak,
  count(distinct ev.day) filter (where ev.kind = 'card_opened')                as cards_opened,
  bool_or(ev.kind = 'history_synced')                                          as synced_history
from ev left join mornings m using (device_id)
group by ev.device_id
order by first_day desc;

-- Per local day: devices that opened, set an evening, held the sun, finished a morning, opened a card
create or replace view public.daybreak_daily with (security_invoker = on) as
select day,
  count(distinct device_id) filter (where kind = 'app_opened')        as opened,
  count(distinct device_id) filter (where kind = 'evening_set')       as evenings_set,
  count(distinct device_id) filter (where kind = 'sun_hold_done')     as sun_holds,
  count(distinct device_id) filter (where kind = 'breaths_skipped')   as breaths_skipped,
  count(distinct device_id) filter (where kind = 'morning_completed') as mornings_completed,
  count(distinct device_id) filter (where kind = 'card_opened')       as cards_opened
from public.daybreak_events
group by day
order by day desc;

-- Retention. Day 0 = the device's first day (first open, or its first morning carried in by history_synced).
-- A metric is final once its window has passed (window end < today, UTC). Not yet final: not_yet_eligible.
create or replace view public.daybreak_retention with (security_invoker = on) as
with d0 as (select device_id, first_day as d0 from public.daybreak_testers),
per as (
  select d0.device_id, d0.d0,
    exists (select 1 from public.daybreak_events e where e.device_id = d0.device_id and e.kind = 'app_opened' and e.day = d0.d0 + 1) as opened_d1,
    exists (select 1 from public.daybreak_mornings m where m.device_id = d0.device_id and m.day = d0.d0 + 1)                         as morning_d1,
    exists (select 1 from public.daybreak_events e where e.device_id = d0.device_id and e.kind = 'app_opened' and e.day between d0.d0 + 1 and d0.d0 + 7) as opened_d1_7,
    (select count(distinct m.day) from public.daybreak_mornings m where m.device_id = d0.device_id and m.day between d0.d0 and d0.d0 + 6) as mornings_week1
  from d0
),
m(ord, metric, definition, last_day_offset, hit, d0) as (
  select 1, 'came_back_day1',   'opened the app on day 1', 1, opened_d1, d0 from per union all
  select 2, 'morning_day1',     'finished a morning on day 1', 1, morning_d1, d0 from per union all
  select 3, 'came_back_week1',  'opened the app on any of days 1-7', 7, opened_d1_7, d0 from per union all
  select 4, 'week1_3plus',      'finished mornings on 3+ distinct days of days 0-6', 6, mornings_week1 >= 3, d0 from per
)
select ord, metric, definition,
  count(*) filter (where d0 + last_day_offset < current_date and hit) as numerator,
  count(*) filter (where d0 + last_day_offset < current_date)         as denominator,
  round(100.0 * count(*) filter (where d0 + last_day_offset < current_date and hit)
        / nullif(count(*) filter (where d0 + last_day_offset < current_date), 0), 1) as pct,
  count(*) filter (where d0 + last_day_offset >= current_date) as not_yet_eligible
from m
group by ord, metric, definition, last_day_offset
order by ord;

revoke all on public.daybreak_events, public.daybreak_mornings, public.daybreak_testers, public.daybreak_daily,
  public.daybreak_retention from anon, authenticated;

commit;
