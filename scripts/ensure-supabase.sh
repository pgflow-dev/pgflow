#!/usr/bin/env bash
set -e

# Usage: ensure-supabase.sh <path-to-supabase-parent-dir>
if [ -z "$1" ]; then
  echo "ERROR: Supabase directory path required"
  echo "Usage: ensure-supabase.sh <path-to-supabase-parent-dir>"
  exit 1
fi

SUPABASE_DIR="$1"

if [ ! -d "$SUPABASE_DIR/supabase" ]; then
  echo "ERROR: No supabase/ directory found in $SUPABASE_DIR"
  exit 1
fi

cd "$SUPABASE_DIR"

if pnpm supabase status &>/dev/null; then
  echo "✓ Supabase already running in $SUPABASE_DIR"
  exit 0
fi

echo "Starting Supabase in $SUPABASE_DIR..."
pnpm supabase start
