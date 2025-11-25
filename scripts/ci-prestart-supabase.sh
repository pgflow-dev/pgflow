#!/bin/bash
# scripts/ci-prestart-supabase.sh
#
# Pre-starts Supabase for affected packages in CI.
# First instance pulls Docker images, rest start in parallel.
#
# Usage: ./scripts/ci-prestart-supabase.sh <package1> [package2] ...
#   Example: ./scripts/ci-prestart-supabase.sh core client
#   Example: ./scripts/ci-prestart-supabase.sh edge-worker
#
# Env vars:
#   NX_BASE - Base ref for affected check (default: origin/main)
#   NX_HEAD - Head ref for affected check (default: HEAD)
#
# Optimization: Supabase start has two slow phases:
#   1. Docker image pull (~slow first time, then cached)
#   2. Container startup (~28s even with cached images)
# This script starts the first instance (pulls images), then starts
# the rest in parallel to save ~1 minute on CI runs.

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <package1> [package2] ..."
  echo "Example: $0 core client"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE=${NX_BASE:-origin/main}
HEAD=${NX_HEAD:-HEAD}

# Map packages to their directories
declare -A PKG_DIRS=(
  ["core"]="pkgs/core"
  ["client"]="pkgs/client"
  ["edge-worker"]="pkgs/edge-worker"
  ["cli"]="pkgs/cli"
)

# Get all affected projects with supabase:ci-marker target
AFFECTED=$(pnpm nx show projects --affected -t supabase:ci-marker --base="$BASE" --head="$HEAD" 2>/dev/null || echo "")

# Filter to only packages specified as arguments
DIRS=()
for pkg in "$@"; do
  if [ -z "${PKG_DIRS[$pkg]:-}" ]; then
    echo "Warning: Unknown package '$pkg', skipping"
    continue
  fi
  if echo "$AFFECTED" | grep -q "^${pkg}$"; then
    DIRS+=("${PKG_DIRS[$pkg]}")
    echo "Package '$pkg' is affected"
  else
    echo "Package '$pkg' is not affected, skipping"
  fi
done

if [ ${#DIRS[@]} -eq 0 ]; then
  echo "No affected packages need Supabase"
  exit 0
fi

echo "Starting Supabase for: ${DIRS[*]}"

LOGDIR=$(mktemp -d)
trap "rm -rf $LOGDIR" EXIT

# First one pulls Docker images (must complete before others)
echo "::group::Starting ${DIRS[0]} (pulling Docker images)"
if ! "$SCRIPT_DIR/supabase-start-locked.sh" "${DIRS[0]}" 2>&1 | tee "$LOGDIR/first.log"; then
  echo "::endgroup::"
  echo "::error::Failed to start ${DIRS[0]}"
  exit 1
fi
echo "::endgroup::"

# Rest in parallel (images cached, ~28s each but concurrent)
if [ ${#DIRS[@]} -gt 1 ]; then
  REMAINING=$((${#DIRS[@]} - 1))
  echo "Starting $REMAINING more instance(s) in parallel..."

  PIDS=()
  for dir in "${DIRS[@]:1}"; do
    name=$(basename "$dir")
    "$SCRIPT_DIR/supabase-start-locked.sh" "$dir" > "$LOGDIR/$name.log" 2>&1 &
    PIDS+=("$!:$dir:$name")
  done

  FAILED=0
  for entry in "${PIDS[@]}"; do
    pid=${entry%%:*}
    rest=${entry#*:}
    dir=${rest%%:*}
    name=${rest#*:}
    if ! wait "$pid"; then
      echo "::error::Failed to start $dir"
      echo "::group::$name log"
      cat "$LOGDIR/$name.log"
      echo "::endgroup::"
      FAILED=1
    else
      echo ":: $dir started"
    fi
  done

  if [ $FAILED -eq 1 ]; then
    exit 1
  fi
fi

echo "All Supabase instances started"
