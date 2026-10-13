#!/usr/bin/env bash
# Recreates a throwaway local database, applies every migration and runs the SQL test files.
# Requires a local PostgreSQL 17 server (never point this at Supabase).
# Usage: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-msme_test}
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_stubs.sql
for f in supabase/migrations/*.sql; do psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"; done
for f in supabase/tests/[1-9]*.sql; do
  echo "== $f"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" 2>&1 | sed -n -e 's/^.*NOTICE:  //p' -e '/ERROR/p'
done
echo "All SQL tests passed."
