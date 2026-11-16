#!/usr/bin/env bash
# Regenerates supabase/setup_all.sql (all migrations in order) for pasting into the Supabase SQL editor.
set -euo pipefail
cd "$(dirname "$0")/.."
{
  echo "-- Apprentice OS: complete database setup (all migrations combined)."
  echo "-- Paste this ENTIRE file into Supabase → SQL Editor and click Run. Run it once, on a NEW project."
  echo "-- For an existing project, run only the migration files added since your last setup."
  echo
  for f in supabase/migrations/*.sql; do
    echo; echo "-- ===================== $f ====================="; cat "$f"
  done
} > supabase/setup_all.sql
echo "wrote supabase/setup_all.sql"
