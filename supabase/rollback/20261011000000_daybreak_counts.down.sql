-- Rollback for migrations/20261011000000_daybreak_counts.sql. Not a migration: run it by hand only if needed.
-- Removes the Daybreak reports. Keeps the Daybreak kinds and payload rules: rows of those kinds may exist, and removing
-- the kinds would fail on them; the app keeps working (and keeps sending) either way.
begin;
drop view if exists public.daybreak_retention;
drop view if exists public.daybreak_daily;
drop view if exists public.daybreak_testers;
drop view if exists public.daybreak_mornings;
drop view if exists public.daybreak_events;
commit;
