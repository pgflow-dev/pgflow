#!/bin/bash
# Dump baseline schema from a fresh Supabase instance
#
# This script:
# 1. Creates a fresh Supabase project (no pgflow)
# 2. Verifies extension availability matches our assumptions
# 3. Dumps the schema as our baseline
# 4. Cleans up
#
# Run this when:
# - Supabase CLI version changes
# - Adding new Supabase-provided schemas to baseline

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Use npx to run supabase directly in this directory (not via pnpm which runs from pkgs/core)
SUPA="npx supabase"

echo "=== Cleaning up any previous temp project ==="
rm -rf supabase/ || true

echo "=== Initializing fresh Supabase project ==="
$SUPA init --force

echo "=== Stopping any running Supabase instances ==="
$SUPA stop --all || true

echo "=== Starting fresh Supabase ==="
$SUPA start

echo "=== Getting database URL ==="
DB_URL=$($SUPA status --output json | jq -r '.DB_URL')
echo "DB_URL: $DB_URL"

echo "=== Matching hosted Supabase defaults ==="
# Local CLI pre-installs pg_net, but hosted Supabase doesn't
# Drop it to match hosted behavior (our migrations will create it)
echo "Dropping pg_net to match hosted Supabase defaults..."
psql "$DB_URL" -c "DROP EXTENSION IF EXISTS pg_net CASCADE;" 2>/dev/null || true

echo "=== Verifying extension assumptions ==="
# Query extension status (using --no-psqlrc to avoid extra output)
EXTENSION_STATUS=$(PAGER='' psql "$DB_URL" --no-psqlrc -t -A -F'|' -c "
SELECT
  name,
  CASE WHEN installed_version IS NOT NULL THEN 'installed' ELSE 'available' END as status
FROM pg_available_extensions
WHERE name IN ('pgmq', 'pg_cron', 'pg_net', 'supabase_vault')
ORDER BY name;
")

echo "Extension status:"
echo "$EXTENSION_STATUS"

# Expected state matching HOSTED Supabase (not local CLI)
# - supabase_vault: pre-installed
# - pgmq, pg_cron, pg_net: available but NOT installed
EXPECTED="pg_cron|available
pg_net|available
pgmq|available
supabase_vault|installed"

if [ "$EXTENSION_STATUS" != "$EXPECTED" ]; then
  echo ""
  echo "ERROR: Extension status does not match hosted Supabase assumptions!"
  echo ""
  echo "Expected (matching hosted Supabase):"
  echo "$EXPECTED"
  echo ""
  echo "Got:"
  echo "$EXTENSION_STATUS"
  echo ""
  echo "If hosted Supabase changed defaults, update this script's expectations."
  $SUPA stop
  rm -rf supabase/
  exit 1
fi

echo ""
echo "Extension assumptions verified (matches hosted Supabase)!"

echo "=== Dumping full \\dx output ==="
psql "$DB_URL" -c '\dx' > fresh-extensions.txt
echo "Saved to fresh-extensions.txt"

echo "=== Dumping baseline schema ==="
# Only dump schemas we need:
# - realtime: we reference realtime.send()
# - vault: supabase_vault is pre-installed here
# Skip extensions schema - it contains Supabase internal event triggers
# that reference roles not available in Atlas dev container
atlas schema inspect \
  --schema realtime,vault \
  -u "$DB_URL?sslmode=disable" \
  --format "{{ sql . }}" > supabase-baseline-schema.sql

# Strip VERSION strings (they change between Supabase versions)
sed -i 's/ VERSION "[^"]*"//g' supabase-baseline-schema.sql

# Strip date-specific partitions (they change daily, we don't reference them)
# e.g., messages_2025_12_04, messages_2025_12_05, etc.
sed -i '/messages_20[0-9]\{2\}_[0-9]\{2\}_[0-9]\{2\}/d' supabase-baseline-schema.sql

echo "Saved to supabase-baseline-schema.sql"

echo "=== Stopping Supabase ==="
$SUPA stop

echo "=== Cleaning up temp project ==="
rm -rf supabase/

echo ""
echo "=== Done! ==="
echo "Baseline regenerated from fresh Supabase."
echo "Commit the updated supabase-baseline-schema.sql and fresh-extensions.txt"
