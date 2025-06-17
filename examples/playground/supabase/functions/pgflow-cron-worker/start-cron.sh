#!/bin/bash

# Start the pg_cron job for the pgflow cron worker
# This script gets the database URL from supabase status

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/../../.."

# Get database URL from supabase status
echo "Getting database URL from supabase status..."
DB_URL=$(cd "$PROJECT_ROOT" && ./scripts/supabase status --output json | jq -r '.DB_URL')

if [ -z "$DB_URL" ] || [ "$DB_URL" = "null" ]; then
  echo "Error: Could not get database URL from supabase status"
  echo "Make sure supabase is running: npm run supabase:start"
  exit 1
fi

echo "Using database URL: $DB_URL"
echo ""
echo "Setting up pg_cron job for pgflow-cron-worker..."
echo ""

# Run the SQL script (it already handles duplicate prevention)
psql "$DB_URL" -f "$SCRIPT_DIR/setup-cron-local.sql"

echo ""
echo "Done! The cron job should now be running every 4 seconds."
echo ""
echo "To check the job status, run:"
echo "  psql \"$DB_URL\" -c \"SELECT * FROM cron.job;\""
echo ""
echo "To stop the cron job, run:"
echo "  ./stop-cron.sh"