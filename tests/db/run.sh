#!/usr/bin/env bash
# Database tests on two dev databases: production's schema as it really is (004-006, never 007, then the Daybreak
# migration), and a fresh setup.sql (run twice: it must be safe to re-run). Needs psql and a dev Postgres.
# Never point DEV_DB_ADMIN_URL at production: it creates and drops databases.
set -euo pipefail
cd "$(dirname "$0")/../.."
ADMIN="${DEV_DB_ADMIN_URL:-postgres://mwtest:dev-only@localhost:5432/postgres}"
case "$ADMIN" in *supabase.co*|*pooler.supabase*) echo "Refusing: DEV_DB_ADMIN_URL looks like Supabase. Use a local dev database."; exit 2;; esac
db() { echo "${ADMIN%/*}/$1"; }
P="psql -X -q -v ON_ERROR_STOP=1"
fail=0
for name in mw_test_prod mw_test_fresh; do
  $P "$ADMIN" -c "drop database if exists $name with (force)" -c "create database $name"
done
M=supabase/migrations
$P "$(db mw_test_prod)" -f tests/db/supabase_roles.sql -f tests/db/fixtures/production_baseline_main.sql \
  -f $M/20261004000000_intention_routine.sql -f $M/20261005000000_reliability_metrics.sql -f $M/20261006000000_setup_onboarding.sql \
  -f $M/20261011000000_daybreak_counts.sql -f $M/20261011000000_daybreak_counts.sql
$P "$(db mw_test_fresh)" -f tests/db/supabase_roles.sql -f supabase/setup.sql -f supabase/setup.sql
run() { out=$($P "$(db $1)" -f tests/db/$2.sql 2>&1) || { echo "$out"; fail=1; }
  echo "# db $2 ($1): $(grep -c PASS <<<"$out") passed$(grep -q FAIL <<<"$out" && echo ', with FAILS' || true)"
  grep -q FAIL <<<"$out" && { grep FAIL <<<"$out"; fail=1; } || true; }
for t in security_test daybreak_test; do run mw_test_prod $t; done
for t in security_test metrics_test setup_test ticks_test daybreak_test; do run mw_test_fresh $t; done
exit $fail
