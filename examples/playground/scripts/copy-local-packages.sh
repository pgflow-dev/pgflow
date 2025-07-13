#!/bin/bash

# Script to copy local package builds to Supabase functions for local development

set -e

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
FUNCTIONS_DIR="$SCRIPT_DIR/../supabase/functions"

echo "Copying local package builds to Supabase functions..."

# Create _dist directory if it doesn't exist
mkdir -p "$FUNCTIONS_DIR/_dist"

# Copy @pgflow/dsl
if [ -d "$PROJECT_ROOT/pkgs/dsl/dist" ]; then
  echo "Copying @pgflow/dsl..."
  rm -rf "$FUNCTIONS_DIR/_dist/dsl"
  cp -r "$PROJECT_ROOT/pkgs/dsl/dist" "$FUNCTIONS_DIR/_dist/dsl"
else
  echo "Warning: @pgflow/dsl dist not found. Run 'pnpm nx build dsl' first."
fi

# Copy @pgflow/core
if [ -d "$PROJECT_ROOT/pkgs/core/dist" ]; then
  echo "Copying @pgflow/core..."
  rm -rf "$FUNCTIONS_DIR/_dist/core"
  cp -r "$PROJECT_ROOT/pkgs/core/dist" "$FUNCTIONS_DIR/_dist/core"
else
  echo "Warning: @pgflow/core dist not found. Run 'pnpm nx build core' first."
fi

# Copy @pgflow/edge-worker source files (no dist build for Deno/JSR)
if [ -d "$PROJECT_ROOT/pkgs/edge-worker/src" ]; then
  echo "Copying @pgflow/edge-worker source files..."
  rm -rf "$FUNCTIONS_DIR/_dist/edge-worker"
  cp -r "$PROJECT_ROOT/pkgs/edge-worker/src" "$FUNCTIONS_DIR/_dist/edge-worker"
else
  echo "Warning: @pgflow/edge-worker src not found."
fi

echo "Done! Local packages copied to $FUNCTIONS_DIR/_dist"