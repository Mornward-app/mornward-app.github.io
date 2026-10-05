-- Mornward: look at a database BEFORE the migrations (004 → 005 → 006). Read-only: it changes nothing.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Every row should say OK; anything else,
-- stop and ask before running the migrations.

with allowed(kind) as (
  values ('morning_start'), ('morning_done'), ('setup_done'), ('rating'), ('door_open'), ('screen_view'),
         ('routine_started'), ('breathing_completed'), ('breathing_skipped'), ('intention_saved'), ('intention_skipped'),
         ('routine_finished'), ('core_routine_completed'), ('install_prompt'), ('app_installed'),
         ('tasks_saved'), ('tasks_skipped'), ('reminder_setup'), ('setup_started'), ('setup_completed')
),
cols as (
  select string_agg(column_name, ', ' order by ordinal_position) as list
  from information_schema.columns where table_schema = 'public' and table_name = 'events'
)
select 1 as "#", 'The events table exists' as "check",
       case when to_regclass('public.events') is not null then 'OK' else 'MISSING' end as result,
       coalesce((select list from cols), '') as detail
union all
select 2, 'Rows stored so far (kept as they are)', 'OK',
       (select count(*) || ' rows, ' || count(distinct device_id) || ' devices, ' || coalesce(min(day)::text, '-') || ' to ' || coalesce(max(day)::text, '-')
        from public.events)
union all
select 3, 'Every stored event type is one the migrations allow',
       case when (select count(*) from public.events where kind not in (select kind from allowed)) = 0 then 'OK' else 'STOP' end,
       coalesce((select string_agg(distinct kind, ', ') from public.events where kind not in (select kind from allowed)), 'none outside the list')
union all
select 4, 'Not migrated yet (no event_id column)',
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'event_id')
            then 'ALREADY HAS IT' else 'OK' end,
       'If this says ALREADY HAS IT, part of the migrations has run before: ask first'
union all
select 5, 'Row level security is on (the app can only add rows)',
       case when (select relrowsecurity from pg_class where oid = 'public.events'::regclass) then 'OK' else 'OFF' end,
       ''
union all
select 6, 'The app''s insert rule exists',
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and cmd = 'INSERT') then 'OK' else 'MISSING' end,
       coalesce((select string_agg(policyname, ', ') from pg_policies where schemaname = 'public' and tablename = 'events'), '')
order by 1;
