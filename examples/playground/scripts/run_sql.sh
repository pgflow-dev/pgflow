#!/bin/bash

# Script to run SQL queries using the local Supabase database
# Usage: 
#   ./scripts/run_sql.sh "SELECT * FROM table;"
#   ./scripts/run_sql.sh -c "SELECT * FROM table;"
#   ./scripts/run_sql.sh -f file.sql
#   echo "SELECT 1;" | ./scripts/run_sql.sh

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Get database URL from supabase status
DB_URL=$("$SCRIPT_DIR/supabase" status --output json 2>/dev/null | jq -r '.DB_URL')

if [ -z "$DB_URL" ] || [ "$DB_URL" = "null" ]; then
  echo "Error: Could not get database URL from supabase status" >&2
  echo "Make sure supabase is running: npm run supabase:start" >&2
  exit 1
fi

# If no arguments provided but stdin is available, use stdin
if [ $# -eq 0 ] && [ ! -t 0 ]; then
  psql "$DB_URL"
# If a single argument without -c or -f flag, assume it's a SQL command
elif [ $# -eq 1 ] && [[ ! "$1" =~ ^- ]]; then
  psql "$DB_URL" -c "$1"
else
  # Otherwise pass all arguments through to psql
  psql "$DB_URL" "$@"
fi