#!/bin/bash

# Script to publish @pgflow/edge-worker to JSR
# 
# Usage:
#   ./scripts/jsr-publish.sh        # Publish to JSR
#   ./scripts/jsr-publish.sh --dry  # Validate without publishing (dry run)

DRY_RUN=""
if [ "$1" == "--dry" ] || [ "$1" == "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo "Running in dry-run mode (validation only)"
fi

# Get the current version from jsr.json in the edge-worker directory
EDGE_WORKER_DIR="./pkgs/edge-worker"
EDGE_WORKER_VERSION=$(jq -r '.version' "$EDGE_WORKER_DIR/jsr.json")

echo "Publishing @pgflow/edge-worker version $EDGE_WORKER_VERSION to JSR..."

# Navigate to the edge-worker directory and publish to JSR
cd "$EDGE_WORKER_DIR" || { echo "Error: Could not find edge-worker directory"; exit 1; }

# Run JSR publish with --allow-slow-types flag
jsr publish --allow-slow-types $DRY_RUN

RESULT=$?
if [ $RESULT -eq 0 ]; then
  if [ -z "$DRY_RUN" ]; then
    echo "Successfully published @pgflow/edge-worker to JSR"
  else
    echo "Dry run successful - @pgflow/edge-worker is ready to be published to JSR"
  fi
else
  if [ -z "$DRY_RUN" ]; then
    echo "Failed to publish @pgflow/edge-worker to JSR"
  else
    echo "Dry run failed - @pgflow/edge-worker is not ready to be published to JSR"
  fi
  exit $RESULT
fi