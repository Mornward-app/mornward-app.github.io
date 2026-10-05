-- Rollback for migrations/20261006000000_setup_onboarding.sql. Not a migration: run it by hand only if needed.
-- Removes setup_report. Keeps the two setup kinds allowed and the payload check as extended: setup rows may exist,
-- and removing the kinds would fail on them; a beta-5 app with setup keeps working.
begin;
drop view if exists public.setup_report;
commit;
