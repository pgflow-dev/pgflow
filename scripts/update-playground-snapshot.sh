#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Usage info
show_help() {
  cat << EOF
Update playground dependencies to use snapshot versions

Usage: $0 [OPTIONS] SNAPSHOT_VERSION

Arguments:
  SNAPSHOT_VERSION    The snapshot version to use (e.g., 0.0.0-my-feature-20240101120000-abc1234)

Options:
  -h, --help          Show this help message
  --dry-run           Show what would be changed without making changes
  --auto-sync         Automatically run sync-edge-deps.sh after updating

Examples:
  $0 0.0.0-my-feature-20240101120000-abc1234
  $0 --dry-run 0.0.0-my-feature-20240101120000-abc1234
  $0 --auto-sync 0.0.0-my-feature-20240101120000-abc1234
EOF
}

# Parse arguments
DRY_RUN=false
AUTO_SYNC=false
SNAPSHOT_VERSION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_help
      exit 0
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --auto-sync)
      AUTO_SYNC=true
      shift
      ;;
    *)
      if [[ -z "$SNAPSHOT_VERSION" ]]; then
        SNAPSHOT_VERSION="$1"
      else
        echo "Error: Unknown argument '$1'"
        show_help
        exit 1
      fi
      shift
      ;;
  esac
done

# Validate arguments
if [[ -z "$SNAPSHOT_VERSION" ]]; then
  echo "Error: SNAPSHOT_VERSION is required"
  show_help
  exit 1
fi

# Validate snapshot version format
if [[ ! "$SNAPSHOT_VERSION" =~ ^0\.0\.0-.* ]]; then
  echo "Error: SNAPSHOT_VERSION must start with '0.0.0-' (got: $SNAPSHOT_VERSION)"
  exit 1
fi

PLAYGROUND_DIR="$ROOT/examples/playground"
DENO_JSON="$PLAYGROUND_DIR/supabase/functions/deno.json"
PACKAGE_JSON="$PLAYGROUND_DIR/package.json"

# Check if playground exists
if [[ ! -d "$PLAYGROUND_DIR" ]]; then
  echo "Error: Playground directory not found at $PLAYGROUND_DIR"
  exit 1
fi

echo "Updating playground to use snapshot version: $SNAPSHOT_VERSION"

# Update deno.json
if [[ -f "$DENO_JSON" ]]; then
  echo "Updating $DENO_JSON..."
  
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN] Would update deno.json imports:"
    jq -r '.imports | to_entries[] | select(.key | contains("@pgflow/")) | "    " + .key + ": " + .value' "$DENO_JSON"
  else
    # Create backup
    cp "$DENO_JSON" "$DENO_JSON.backup"
    
    # Update npm packages
    jq --arg version "$SNAPSHOT_VERSION" '
      .imports |= with_entries(
        if (.key | contains("@pgflow/")) and (.value | startswith("npm:")) then
          .value = "npm:" + (.key) + "@" + $version
        else
          .
        end
      )
    ' "$DENO_JSON" > "$DENO_JSON.tmp" && mv "$DENO_JSON.tmp" "$DENO_JSON"
    
    # Update JSR packages
    jq --arg version "$SNAPSHOT_VERSION" '
      .imports |= with_entries(
        if (.key | contains("@pgflow/")) and (.value | startswith("jsr:")) then
          .value = "jsr:" + (.key) + "@" + $version
        else
          .
        end
      )
    ' "$DENO_JSON" > "$DENO_JSON.tmp" && mv "$DENO_JSON.tmp" "$DENO_JSON"
    
    echo "  ✅ Updated deno.json"
  fi
else
  echo "Warning: $DENO_JSON not found, skipping"
fi

# Update package.json
if [[ -f "$PACKAGE_JSON" ]]; then
  echo "Updating $PACKAGE_JSON..."
  
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN] Would update package.json dependencies:"
    jq -r '.dependencies | to_entries[] | select(.key | startswith("@pgflow/")) | "    " + .key + ": " + .value' "$PACKAGE_JSON"
  else
    # Create backup
    cp "$PACKAGE_JSON" "$PACKAGE_JSON.backup"
    
    # Update dependencies
    jq --arg version "$SNAPSHOT_VERSION" '
      .dependencies |= with_entries(
        if (.key | startswith("@pgflow/")) then
          .value = $version
        else
          .
        end
      )
    ' "$PACKAGE_JSON" > "$PACKAGE_JSON.tmp" && mv "$PACKAGE_JSON.tmp" "$PACKAGE_JSON"
    
    echo "  ✅ Updated package.json"
  fi
else
  echo "Warning: $PACKAGE_JSON not found, skipping"
fi

# Auto-sync edge dependencies
if [[ "$AUTO_SYNC" == "true" && "$DRY_RUN" != "true" ]]; then
  echo "Running sync-edge-deps.sh..."
  if [[ -x "$PLAYGROUND_DIR/scripts/sync-edge-deps.sh" ]]; then
    cd "$PLAYGROUND_DIR"
    ./scripts/sync-edge-deps.sh
  else
    echo "Warning: sync-edge-deps.sh not found or not executable"
  fi
fi

if [[ "$DRY_RUN" != "true" ]]; then
  echo ""
  echo "✅ Playground updated successfully!"
  echo ""
  echo "Next steps:"
  echo "1. If you haven't already, run: cd examples/playground && ./scripts/sync-edge-deps.sh"
  echo "2. Test your changes with: npm run dev"
  echo ""
  echo "To restore previous versions:"
  echo "  mv $DENO_JSON.backup $DENO_JSON"
  echo "  mv $PACKAGE_JSON.backup $PACKAGE_JSON"
else
  echo ""
  echo "[DRY RUN] No changes were made"
fi