#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EDGE_WORKER_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_ROOT="$(cd "$EDGE_WORKER_DIR/../.." && pwd)"
VENDOR_DIR="$EDGE_WORKER_DIR/supabase/functions/_vendor"

echo "🔄 Syncing edge function dependencies for e2e tests..."

# Clean and create vendor directory
rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR/@pgflow"

# Verify builds succeeded
if [ ! -d "$MONOREPO_ROOT/pkgs/core/dist" ]; then
    echo "❌ Error: core package build failed - dist directory not found"
    exit 1
fi

if [ ! -d "$MONOREPO_ROOT/pkgs/dsl/dist" ]; then
    echo "❌ Error: dsl package build failed - dist directory not found"
    exit 1
fi

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

# Copy edge-worker source (not built) - preserving directory structure
echo "📋 Copying @pgflow/edge-worker..."
mkdir -p "$VENDOR_DIR/@pgflow/edge-worker"
# Copy the entire src directory to maintain relative imports
cp -r "$MONOREPO_ROOT/pkgs/edge-worker/src" "$VENDOR_DIR/@pgflow/edge-worker/"

# Simple fix: replace .js with .ts in imports
find "$VENDOR_DIR/@pgflow/edge-worker" -name "*.ts" -type f -exec sed -i 's/\.js"/\.ts"/g' {} +
find "$VENDOR_DIR/@pgflow/edge-worker" -name "*.ts" -type f -exec sed -i "s/\.js'/\.ts'/g" {} +

# Create a redirect index.ts at the root that points to src/index.ts
cat > "$VENDOR_DIR/@pgflow/edge-worker/index.ts" << 'EOF'
// Re-export from the src directory to maintain compatibility
export * from './src/index.ts';
EOF

# Create _internal.ts redirect as well since edge-worker exports this path
cat > "$VENDOR_DIR/@pgflow/edge-worker/_internal.ts" << 'EOF'
// Re-export from the src directory to maintain compatibility
export * from './src/_internal.ts';
EOF

# Verify key files exist
if [ ! -f "$VENDOR_DIR/@pgflow/core/index.js" ]; then
    echo "⚠️  Warning: @pgflow/core/index.js not found after copy"
fi

if [ ! -f "$VENDOR_DIR/@pgflow/dsl/index.js" ]; then
    echo "⚠️  Warning: @pgflow/dsl/index.js not found after copy"
fi

if [ ! -f "$VENDOR_DIR/@pgflow/edge-worker/src/index.ts" ]; then
    echo "⚠️  Warning: @pgflow/edge-worker/src/index.ts not found after copy"
fi

echo "✅ Dependencies synced to $VENDOR_DIR"
