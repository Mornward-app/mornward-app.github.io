-- Mornward: anonymous beta stats
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
--
-- What it does:
--   * one table, "events", that the app can only ADD rows to (it can't read, change or delete anything)
--   * size and shape checks so the table can't be filled with junk
--   * four read-only views for you: daily_mornings, testers, pass_rules, step_stats
-- Nothing personal is stored: a random device id, the day, and counts/choices.

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  device_id   uuid not null,
  day         date not null,
  kind        text not null check (kind in ('morning_start', 'morning_done', 'setup_done', 'rating', 'door_open')),
  data        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2048),
  app_version text check (char_length(app_version) <= 20)
);

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

-- Per day: how many people started and finished a morning, and how they rated it
create or replace view public.daily_mornings with (security_invoker = on) as
select
  day,
  count(distinct device_id) filter (where kind = 'morning_start') as people_started,
  count(distinct device_id) filter (where kind = 'morning_done')  as people_finished,
  count(*) filter (where kind = 'rating' and data->>'value' = 'good') as rated_good,
  count(*) filter (where kind = 'rating' and data->>'value' = 'ok')   as rated_ok,
  count(*) filter (where kind = 'rating' and data->>'value' = 'bad')  as rated_bad
from public.events
group by day
order by day desc;

-- Per tester (anonymous device): when they started and how many mornings they finished in weeks 1 and 2
create or replace view public.testers with (security_invoker = on) as
with firsts as (
  select device_id, min(day) as first_day from public.events group by device_id
),
done as (
  select distinct device_id, day from public.events where kind = 'morning_done'
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
where kind = 'morning_done';

revoke all on public.daily_mornings, public.testers, public.pass_rules, public.step_stats from anon, authenticated;
