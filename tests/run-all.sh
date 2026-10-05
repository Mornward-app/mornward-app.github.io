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
  -f supabase/migrations/20261005000000_reliability_metrics.sql
$P "$(db mw_test_fresh)" -f tests/db/supabase_roles.sql -f supabase/setup.sql -f supabase/setup.sql
for name in mw_test_upgrade mw_test_fresh; do
  for t in security_test metrics_test; do
    out=$($P "$(db $name)" -f tests/db/$t.sql 2>&1) || { echo "$out"; fail=1; }
    echo "# db $t ($name): $(grep -c PASS <<<"$out") passed$(grep -q FAIL <<<"$out" && echo ', with FAILS' || true)"
    grep -q FAIL <<<"$out" && { grep FAIL <<<"$out"; fail=1; }
  done
done
for t in routine dates privacy reminders pwa ingest; do
  node "tests/e2e/$t.test.js" || fail=1
done
exit $fail
