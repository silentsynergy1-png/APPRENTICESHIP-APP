#!/usr/bin/env bash
# Recreates a scratch database, applies the Supabase stub + all migrations, then runs RLS tests.
# Usage: PGPORT=54329 PGHOST=/tmp ./supabase/tests/run_db_tests.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGUSER=${PGUSER:-postgres}
dropdb --if-exists apprentice_test
createdb apprentice_test
psql -q -v ON_ERROR_STOP=1 -d apprentice_test -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  psql -q -v ON_ERROR_STOP=1 -d apprentice_test -f "$f"
done
psql -v ON_ERROR_STOP=1 -d apprentice_test -f supabase/tests/rls_tests.sql
