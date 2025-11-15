#!/bin/bash
set -e

# ============================================================================
# Supabase Start Locked Wrapper Script
# ============================================================================
# This script wraps supabase-start.sh with file-based locking using flock(1).
#
# PURPOSE:
#   When multiple Nx targets run in parallel and all need Supabase running,
#   we want to serialize the "ensure started" checks so only ONE process
#   actually starts Supabase, while others wait and reuse the running instance.
#
# HOW IT WORKS:
#   1. Computes a lock file path based on the project directory
#   2. Uses flock to acquire an exclusive lock on that file
#   3. Runs the worker script (supabase-start.sh) while holding the lock
#   4. Lock is automatically released when this script exits
#
# WHAT HAPPENS WITH PARALLEL EXECUTION:
#   Process A (first):
#     - Acquires lock immediately
#     - Runs worker → starts Supabase
#     - Releases lock
#
#   Process B (milliseconds later):
#     - Blocks waiting for lock
#     - A releases lock
#     - Acquires lock, runs worker → checks status → already running → fast exit
#     - Releases lock
#
# WHY FORM 1 OF FLOCK:
#   We use: flock <lockfile> <command>
#   This is simpler than file descriptor manipulation (Form 3) and provides
#   exactly what we need: serialize execution of the worker script per-project.
#
# LOCK FILE LOCATION:
#   /tmp/supabase-start-<hash>.lock where <hash> is md5sum of absolute project path
#   - Unique per project (core, client, edge-worker have separate locks)
#   - Standard /tmp location (cleaned on reboot)
#   - Linux-specific (fine for our use case)
#
# Usage: supabase-start-locked.sh <project-directory>
# ============================================================================

# Validate project directory argument
if [ -z "$1" ]; then
  echo "Error: Project directory argument is required" >&2
  echo "Usage: $0 <project-directory>" >&2
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

# Use flock (Form 1) to serialize access to the worker script
# By default, flock blocks until the lock is available, then runs the command
flock "$LOCK_FILE" "$WORKER_SCRIPT" "$PROJECT_DIR_ABS"
