#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYGROUND_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_ROOT="$(cd "$PLAYGROUND_DIR/../.." && pwd)"
VENDOR_DIR="$PLAYGROUND_DIR/supabase/functions/_vendor"
DENO_JSON="$PLAYGROUND_DIR/supabase/functions/deno.json"
DENO_BACKUP="$PLAYGROUND_DIR/supabase/functions/deno.production.json"

echo "🔄 Syncing edge function dependencies for local development..."

# Clean and create vendor directory
rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR/@pgflow"

# Build dependencies
echo "📦 Building packages..."
cd "$MONOREPO_ROOT"
pnpm nx build core
pnpm nx build dsl

# Copy core package
echo "📋 Copying @pgflow/core..."
mkdir -p "$VENDOR_DIR/@pgflow/core"
cp -r "$MONOREPO_ROOT/pkgs/core/dist/"* "$VENDOR_DIR/@pgflow/core/"
cp "$MONOREPO_ROOT/pkgs/core/package.json" "$VENDOR_DIR/@pgflow/core/"

# Copy dsl package
echo "📋 Copying @pgflow/dsl..."
mkdir -p "$VENDOR_DIR/@pgflow/dsl"
cp -r "$MONOREPO_ROOT/pkgs/dsl/dist/"* "$VENDOR_DIR/@pgflow/dsl/"
cp "$MONOREPO_ROOT/pkgs/dsl/package.json" "$VENDOR_DIR/@pgflow/dsl/"

# Copy edge-worker source (not built)
echo "📋 Copying @pgflow/edge-worker..."
mkdir -p "$VENDOR_DIR/@pgflow/edge-worker"
cp -r "$MONOREPO_ROOT/pkgs/edge-worker/src/"* "$VENDOR_DIR/@pgflow/edge-worker/"

# Backup original deno.json if not already backed up
if [ ! -f "$DENO_BACKUP" ]; then
  echo "📦 Backing up production deno.json..."
  cp "$DENO_JSON" "$DENO_BACKUP"
fi

# Update deno.json with local imports
echo "📝 Updating deno.json for local development..."
cat > "$DENO_JSON" << 'EOF'
{
  "imports": {
    "@pgflow/core": "./_vendor/@pgflow/core/index.js",
    "@pgflow/core/": "./_vendor/@pgflow/core/",
    "@pgflow/dsl": "./_vendor/@pgflow/dsl/index.js",
    "@pgflow/dsl/": "./_vendor/@pgflow/dsl/",
    "@pgflow/edge-worker": "./_vendor/@pgflow/edge-worker/index.ts",
    "@pgflow/edge-worker/": "./_vendor/@pgflow/edge-worker/",
    "@pgflow/edge-worker/_internal": "./_vendor/@pgflow/edge-worker/_internal.ts",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2.49.4",
    "@henrygd/queue": "jsr:@henrygd/queue@^1.0.7",
    "groq-sdk": "npm:groq-sdk@^0.20.1",
    "postgres": "npm:postgres@3.4.5",
    "sanitize-html": "npm:sanitize-html@^2.16.0",
    "turndown": "npm:turndown@^7.2.0"
  }
}
EOF

echo "✅ Dependencies synced to $VENDOR_DIR"
echo "✅ deno.json updated for local development"
echo ""
echo "To switch back to published versions, run: ./scripts/restore-production-deps.sh"