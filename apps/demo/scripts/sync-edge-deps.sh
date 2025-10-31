#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"
VENDOR_DIR="$DEMO_DIR/supabase/functions/_vendor"

echo "🔄 Syncing edge function dependencies for local development..."

# Clean and create vendor directory
rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR/@pgflow"

# Verify source directories exist
if [ ! -d "$MONOREPO_ROOT/pkgs/core/src" ]; then
    echo "❌ Error: core package src directory not found"
    exit 1
fi

if [ ! -d "$MONOREPO_ROOT/pkgs/dsl/src" ]; then
    echo "❌ Error: dsl package src directory not found"
    exit 1
fi

# Copy core package TypeScript source
echo "📋 Copying @pgflow/core (TypeScript source)..."
mkdir -p "$VENDOR_DIR/@pgflow/core"
cp -r "$MONOREPO_ROOT/pkgs/core/src" "$VENDOR_DIR/@pgflow/core/"
cp "$MONOREPO_ROOT/pkgs/core/package.json" "$VENDOR_DIR/@pgflow/core/"

# Fix .js extensions in core imports
find "$VENDOR_DIR/@pgflow/core" -name "*.ts" -type f -exec sed -i 's/\.js"/\.ts"/g' {} +
find "$VENDOR_DIR/@pgflow/core" -name "*.ts" -type f -exec sed -i "s/\.js'/\.ts'/g" {} +

# Create index.ts redirect for core
cat > "$VENDOR_DIR/@pgflow/core/index.ts" << 'EOF'
export * from './src/index.ts';
EOF

# Copy dsl package TypeScript source
echo "📋 Copying @pgflow/dsl (TypeScript source)..."
mkdir -p "$VENDOR_DIR/@pgflow/dsl"
cp -r "$MONOREPO_ROOT/pkgs/dsl/src" "$VENDOR_DIR/@pgflow/dsl/"
cp "$MONOREPO_ROOT/pkgs/dsl/package.json" "$VENDOR_DIR/@pgflow/dsl/"

# Fix .js extensions in dsl imports
find "$VENDOR_DIR/@pgflow/dsl" -name "*.ts" -type f -exec sed -i 's/\.js"/\.ts"/g' {} +
find "$VENDOR_DIR/@pgflow/dsl" -name "*.ts" -type f -exec sed -i "s/\.js'/\.ts'/g" {} +

# Create index.ts redirect for dsl
cat > "$VENDOR_DIR/@pgflow/dsl/index.ts" << 'EOF'
export * from './src/index.ts';
EOF

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
if [ ! -f "$VENDOR_DIR/@pgflow/core/index.ts" ]; then
    echo "⚠️  Warning: @pgflow/core/index.ts not found after copy"
fi

if [ ! -f "$VENDOR_DIR/@pgflow/dsl/index.ts" ]; then
    echo "⚠️  Warning: @pgflow/dsl/index.ts not found after copy"
fi

if [ ! -f "$VENDOR_DIR/@pgflow/edge-worker/src/index.ts" ]; then
    echo "⚠️  Warning: @pgflow/edge-worker/src/index.ts not found after copy"
fi

echo "✅ Dependencies synced to $VENDOR_DIR (TypeScript source)"