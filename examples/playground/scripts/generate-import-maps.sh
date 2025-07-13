#!/bin/bash

# Script to generate import mappings for .js -> .ts files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EDGE_WORKER_DIR="$SCRIPT_DIR/../supabase/functions/_dist/edge-worker"

if [ ! -d "$EDGE_WORKER_DIR" ]; then
  echo "Error: Edge worker directory not found at $EDGE_WORKER_DIR"
  echo "Run ./scripts/copy-local-packages.sh first"
  exit 1
fi

echo "Generating import mappings for edge-worker..."

# Find all .ts files and generate mappings
find "$EDGE_WORKER_DIR" -name "*.ts" -type f | while read -r ts_file; do
  # Skip test files
  if [[ "$ts_file" == *"test"* ]] || [[ "$ts_file" == *"spec"* ]]; then
    continue
  fi
  
  # Get relative path from functions directory
  rel_path="${ts_file#*supabase/functions/}"
  
  # Generate .js version
  js_path="${rel_path%.ts}.js"
  
  echo "    \"$js_path\": \"$rel_path\","
done