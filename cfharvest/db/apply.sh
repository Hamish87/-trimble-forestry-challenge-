#!/usr/bin/env bash
# CFHarvest replica · apply the data layer to a Postgres / Supabase database.
#
#   usage: cfharvest/db/apply.sh <DATABASE_URL> [--grants]
#
#   DATABASE_URL  e.g. postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
#                 (Supabase → Project Settings → Database → Connection string, "Session pooler" or direct).
#   --grants      also run grants.sql (demo-only read/write grants for anon/authenticated, see db/README.md).
#
# Runs schema.sql, then seed.sql (both idempotent: safe to run again), each as one transaction (seed.sql has its
# own BEGIN/COMMIT), stopping at the first error. Never prints the URL, because it contains the database password.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
url="${1:-}"
if [[ -z "$url" || "$url" == "-h" || "$url" == "--help" ]]; then
  sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 2
fi
grants=false
[[ "${2:-}" == "--grants" ]] && grants=true

command -v psql >/dev/null 2>&1 || { echo "psql not found (install the PostgreSQL client, e.g. 'brew install libpq' or 'apt install postgresql-client')." >&2; exit 1; }

run() {  # run <file> [extra psql args]
  local f="$1"; shift
  echo "→ $(basename "$f")"
  psql "$url" --no-psqlrc --quiet -v ON_ERROR_STOP=1 "$@" -c "SET client_min_messages = warning" -f "$f"
}

run "$here/schema.sql" --single-transaction
run "$here/seed.sql"
if $grants; then run "$here/grants.sql" --single-transaction; fi

cat <<'EOF'

Schema cfharvest and the demo tenant are in place.

Two settings must be done once in the Supabase dashboard before the replica can use the REST API:

  1. Expose the schema to the Data API
     Project Settings → Data API (API settings) → "Exposed schemas": add  cfharvest  → Save.
     (PostgREST only serves schemas listed there; the replica sends Accept-Profile/Content-Profile: cfharvest.)

  2. Grant the API roles access to the schema (DEMO ONLY — RLS is off, anyone with the publishable key can
     read and write every row):
     run  cfharvest/db/grants.sql  in the SQL editor, or re-run this script with --grants.
       GRANT USAGE ON SCHEMA cfharvest TO anon, authenticated;
       GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA cfharvest TO anon, authenticated;
       GRANT DELETE ON <the tables the replica mirrors> TO anon, authenticated;   (list in grants.sql)

Then fill cfharvest/app/config.js (project URL + publishable key) and open the replica with ?store=supabase.
See cfharvest/db/README.md.
EOF
