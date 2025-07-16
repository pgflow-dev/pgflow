#!/bin/bash
set -euo pipefail

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Paths
DENO_JSON_PATH="$PROJECT_DIR/supabase/functions/deno.json"
TEMP_DENO_JSON="/tmp/generated-deno.json"

# Ensure jq is available
if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required but not installed"
  echo "Please install jq to validate JSON files"
  exit 1
fi

# Ensure the copy-local-packages script exists
if [ ! -f "$SCRIPT_DIR/copy-local-packages.sh" ]; then
  echo "ERROR: copy-local-packages.sh not found"
  exit 1
fi

# Ensure the generate-complete-import-map script exists
if [ ! -f "$SCRIPT_DIR/generate-complete-import-map.sh" ]; then
  echo "ERROR: generate-complete-import-map.sh not found"
  exit 1
fi

# First, validate that the existing deno.json is valid JSON
if ! jq . "$DENO_JSON_PATH" > /dev/null 2>&1; then
  echo "ERROR: supabase/functions/deno.json is not valid JSON"
  echo ""
  echo "JSON validation error:"
  jq . "$DENO_JSON_PATH" 2>&1 || true
  exit 1
fi

# Copy packages first (required for import map generation)
"$SCRIPT_DIR/copy-local-packages.sh" > /dev/null 2>&1

# Generate the import map to a temporary file
"$SCRIPT_DIR/generate-complete-import-map.sh" > "$TEMP_DENO_JSON"

# Validate that the generated file is valid JSON
if ! jq . "$TEMP_DENO_JSON" > /dev/null 2>&1; then
  echo "ERROR: Generated deno.json is not valid JSON"
  echo ""
  echo "JSON validation error:"
  jq . "$TEMP_DENO_JSON" 2>&1 || true
  rm -f "$TEMP_DENO_JSON"
  exit 1
fi

# Compare the generated file with the committed file
if ! diff -q "$DENO_JSON_PATH" "$TEMP_DENO_JSON" > /dev/null 2>&1; then
  echo "ERROR: supabase/functions/deno.json is out of sync with generated import map"
  echo ""
  echo "To fix this, run:"
  echo "  nx run playground:functions:generate-import-map"
  echo ""
  echo "Differences:"
  diff -u "$DENO_JSON_PATH" "$TEMP_DENO_JSON" || true
  rm -f "$TEMP_DENO_JSON"
  exit 1
fi

# Cleanup
rm -f "$TEMP_DENO_JSON"

echo "deno.json verification passed"