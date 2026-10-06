#!/usr/bin/env bash
# Runs every automated check: the database tests on two dev databases (production's schema upgraded, and a fresh
# setup.sql), then the browser tests. Needs: Node with Playwright, psql, a dev Postgres, PostgREST. See tests/README.md.
# Never point DEV_DB_ADMIN_URL at production: it creates and drops databases.
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN="${DEV_DB_ADMIN_URL:-postgres://mwtest:dev-only@localhost:5432/postgres}"
case "$ADMIN" in *supabase.co*|*pooler.supabase*) echo "Refusing: DEV_DB_ADMIN_URL looks like Supabase. Use a local dev database."; exit 2;; esac
db() { echo "${ADMIN%/*}/$1"; }
P="psql -X -q -v ON_ERROR_STOP=1"
fail=0
for name in mw_test_upgrade mw_test_fresh; do
  $P "$ADMIN" -c "drop database if exists $name with (force)" -c "create database $name"
done
$P "$(db mw_test_upgrade)" -f tests/db/supabase_roles.sql -f tests/db/fixtures/production_baseline_main.sql \
  -f supabase/migrations/20261004000000_intention_routine.sql -f supabase/migrations/20261005000000_reliability_metrics.sql \
  -f supabase/migrations/20261006000000_setup_onboarding.sql -f supabase/migrations/20261006000000_setup_onboarding.sql \
  -f supabase/migrations/20261007000000_task_ticks.sql -f supabase/migrations/20261007000000_task_ticks.sql
$P "$(db mw_test_fresh)" -f tests/db/supabase_roles.sql -f supabase/setup.sql -f supabase/setup.sql
for name in mw_test_upgrade mw_test_fresh; do
  for t in security_test metrics_test setup_test ticks_test; do
    out=$($P "$(db $name)" -f tests/db/$t.sql 2>&1) || { echo "$out"; fail=1; }
    echo "# db $t ($name): $(grep -c PASS <<<"$out") passed$(grep -q FAIL <<<"$out" && echo ', with FAILS' || true)"
    grep -q FAIL <<<"$out" && { grep FAIL <<<"$out"; fail=1; }
  done
done
# Re-running is safe even with rows of every kind present (nothing narrows the allowed kinds or payloads)
$P "$(db mw_test_upgrade)" -c "insert into public.events (event_id, device_id, day, kind, data, app_version) values
  (gen_random_uuid(), gen_random_uuid(), current_date, 'setup_started', '{\"run\":0}', 'beta-5'),
  (gen_random_uuid(), gen_random_uuid(), current_date, 'tasks_ticked', '{\"run\":1,\"ticked\":1,\"total\":2}', 'beta-5'),
  (gen_random_uuid(), gen_random_uuid(), current_date, 'tasks_saved', '{\"run\":1,\"count\":1,\"kept_defaults\":false,\"prepared\":true,\"own\":false}', 'beta-5')" \
  -f supabase/migrations/20261005000000_reliability_metrics.sql -f supabase/migrations/20261006000000_setup_onboarding.sql -f supabase/migrations/20261007000000_task_ticks.sql -f supabase/setup.sql \
  -c "insert into public.events (event_id, device_id, day, kind, data, app_version) values (gen_random_uuid(), gen_random_uuid(), current_date, 'setup_completed', '{\"run\":0,\"tasks_prepared\":2}', 'beta-5')" \
  && echo "# db re-run with setup rows present: ok" || { echo "# db re-run with setup rows present: FAILED"; fail=1; }
for t in onboarding onboarding-regressions qr-guide routine carry return progress dates privacy reminders pwa ingest; do
  node "tests/e2e/$t.test.js" || fail=1
done
exit $fail
