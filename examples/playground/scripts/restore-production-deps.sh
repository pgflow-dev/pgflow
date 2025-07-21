#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYGROUND_DIR="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$PLAYGROUND_DIR/supabase/functions/_vendor"
DENO_JSON="$PLAYGROUND_DIR/supabase/functions/deno.json"
DENO_BACKUP="$PLAYGROUND_DIR/supabase/functions/deno.production.json"

echo "🔄 Restoring production dependencies..."

# Check if backup exists
if [ ! -f "$DENO_BACKUP" ]; then
  echo "❌ No production backup found at $DENO_BACKUP"
  echo "   The deno.json file may already be using production dependencies."
  exit 1
fi

# Restore production deno.json
echo "📦 Restoring production deno.json..."
cp "$DENO_BACKUP" "$DENO_JSON"

# Optionally clean up vendor directory
if [ -d "$VENDOR_DIR" ]; then
  echo "🧹 Cleaning up vendor directory..."
  rm -rf "$VENDOR_DIR"
fi

echo "✅ Production dependencies restored"
echo ""
echo "Edge functions will now use published packages from npm/jsr."
echo "To switch back to local development, run: ./scripts/sync-edge-deps.sh"