#!/usr/bin/env bash
set -euo pipefail

# list-topics - List all topic directories (non-underscore top-level folders)
# Usage: list-topics
# Output: One topic name per line

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Validate and get notes directory
NOTES_DIR=$("$SCRIPT_DIR/echo-notes-dir.sh")

# Find all top-level directories that don't start with underscore
# -maxdepth 1: only top level
# -type d: directories only
# -not -name '_*': exclude underscore-prefixed
# -not -name '.': exclude current dir
# -not -name '.*': exclude hidden dirs
# Note: Trailing slash needed for symlink support
topics=$(find "$NOTES_DIR/" -maxdepth 1 -type d \
  -not -name '_*' \
  -not -name '.' \
  -not -name '.*' \
  -printf '%f\n' | sort)

# Count and output with summary
count=$(echo "$topics" | grep -c '^' || echo "0")

if [ "$count" -eq 0 ]; then
  echo "No topics found."
else
  echo "Found $count topic(s):"
  echo ""
  echo "$topics"
fi
