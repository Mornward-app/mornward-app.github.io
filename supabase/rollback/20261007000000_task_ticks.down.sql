-- Rollback for migrations/20261007000000_task_ticks.sql. Not a migration: run it by hand only if needed.
-- Removes task_ticks and task_ticks_report. Keeps tasks_ticked allowed and the payload check as extended: tasks_ticked
-- rows may exist, and removing the kind would fail on them; the app keeps working. The routine_cohort fix is
-- reports-only and is kept (it only stops wrongly leaving out testers whose first routine came from their reminder).
begin;
drop view if exists public.task_ticks_report;
drop view if exists public.task_ticks;
commit;
