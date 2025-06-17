#!/bin/bash

# Stop the pg_cron job for the pgflow cron worker

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

echo "Stopping pg_cron job for pgflow-cron-worker..."
echo ""

# Unschedule the cron job using the exact job name from setup-cron-local.sql
psql "$DB_URL" -c "SELECT cron.unschedule('pgflow-worker--analyze_website');"

echo ""
echo "Cron job stopped."