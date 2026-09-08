#!/bin/bash
set -e

# ============================================================================
# Supabase Start Locked Wrapper Script
# ============================================================================
# This script wraps supabase-start.sh with file-based locking using flock(1).
#
# PURPOSE:
#   When multiple Nx targets need Supabase, serialize startup per project while
#   allowing different projects to start in parallel. A shared environment lock
#   lets test-env:fresh exclude every startup while it removes owned services.
#
# HOW IT WORKS:
#   1. Acquires a shared pgflow test-environment lock
#   2. Computes a lock file path based on the project directory
#   3. Acquires the project's exclusive startup lock
#   4. Optionally stops Supabase, then runs supabase-start.sh while holding both locks
#
# LOCK FILE LOCATIONS:
#   /tmp/pgflow-test-environment.lock coordinates startup with test-env:fresh.
#   /tmp/supabase-start-<hash>.lock serializes startup for one project path.
#
# Usage: supabase-start-locked.sh [--restart] <project-directory>
# ============================================================================

RESTART=false
if [ "${1:-}" = "--restart" ]; then
  RESTART=true
  shift
fi

# Validate project directory argument
if [ -z "${1:-}" ]; then
  echo "Error: Project directory argument is required" >&2
  echo "Usage: $0 [--restart] <project-directory>" >&2
  exit 1
fi

PROJECT_DIR="$1"

# Validate project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Project directory not found: $PROJECT_DIR" >&2
  exit 1
fi

# Normalize to absolute path to ensure consistent lock naming
# This prevents "./pkgs/core" and "pkgs/core" from creating different locks
PROJECT_DIR_ABS=$(realpath "$PROJECT_DIR")

# Create a unique lock file path based on the absolute project directory
# Using md5sum hash to create a safe filename from the directory path
PROJECT_LOCK_NAME=$(echo "$PROJECT_DIR_ABS" | md5sum | cut -d' ' -f1)
LOCK_FILE="/tmp/supabase-start-${PROJECT_LOCK_NAME}.lock"

# Get the directory where this script lives (to find the worker script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_SCRIPT="$SCRIPT_DIR/supabase-start.sh"

# Different projects may start together, but a fresh-environment run excludes all starts.
exec 9>/tmp/pgflow-test-environment.lock
flock --shared 9
exec 8>"$LOCK_FILE"
flock 8

if [ "$RESTART" = true ]; then
  (cd "$PROJECT_DIR_ABS" && pnpm exec supabase stop --no-backup)
fi

exec "$WORKER_SCRIPT" "$PROJECT_DIR_ABS"
