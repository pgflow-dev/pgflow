#!/bin/bash

# Script to generate complete import mappings for edge-worker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EDGE_WORKER_DIR="$SCRIPT_DIR/../supabase/functions/_dist/edge-worker"

if [ ! -d "$EDGE_WORKER_DIR" ]; then
  echo "Error: Edge worker directory not found at $EDGE_WORKER_DIR"
  echo "Run ./scripts/copy-local-packages.sh first"
  exit 1
fi

echo "{"
echo '  "imports": {'
echo '    "@pgflow/core": "./_dist/core/index.js",'
echo '    "@pgflow/dsl": "./_dist/dsl/index.js",'
echo '    "@pgflow/dsl/supabase": "./_dist/dsl/supabase.js",'
echo '    "@pgflow/edge-worker": "./_dist/edge-worker/index.ts",'
echo '    "@pgflow/edge-worker/_internal": "./_dist/edge-worker/_internal.ts",'

# Find all .ts files and generate mappings
find "$EDGE_WORKER_DIR" -name "*.ts" -type f | sort | while read -r ts_file; do
  # Skip test files and type definition files
  if [[ "$ts_file" == *"test"* ]] || [[ "$ts_file" == *"spec"* ]] || [[ "$ts_file" == *.d.ts ]]; then
    continue
  fi
  
  # Get relative path from functions directory
  rel_path="${ts_file#*supabase/functions/}"
  
  # Generate .js version
  js_path="${rel_path%.ts}.js"
  
  echo "    \"./$js_path\": \"./$rel_path\","
done

# Add npm dependencies
echo '    "@henrygd/queue": "npm:@henrygd/queue@^1.0.7",'
echo '    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2.49.4",'
echo '    "groq-sdk": "npm:groq-sdk@^0.20.1",'
echo '    "postgres": "npm:postgres@3.4.5",'
echo '    "sanitize-html": "npm:sanitize-html@^2.16.0",'
echo '    "turndown": "npm:turndown@^7.2.0"'
echo "  }"
echo "}"