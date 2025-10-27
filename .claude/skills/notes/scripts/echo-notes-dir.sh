#!/usr/bin/env bash
# echo-notes-dir.sh - Validate and echo the notes directory path
#
# Usage:
#   In bash scripts: NOTES_DIR=$(bash path/to/echo-notes-dir.sh)
#   In markdown: !`path/to/echo-notes-dir.sh`
#
# Exit codes:
#   0 - Success, echoes "./.notes" to stdout
#   1 - Error, prints error message to stderr

set -euo pipefail

NOTES_DIR="./.notes"

# Check if .notes directory exists
if [ ! -d "$NOTES_DIR" ]; then
  echo "ERROR: .notes directory not found at $NOTES_DIR" >&2
  echo "" >&2
  echo "Please create a symlink to your notes directory:" >&2
  echo "  ln -s /path/to/your/notes-directory .notes" >&2
  echo "" >&2
  echo "Example:" >&2
  echo "  ln -s ~/Documents/pgflow-notes .notes" >&2
  exit 1
fi

# Check if .notes is readable
if [ ! -r "$NOTES_DIR" ]; then
  echo "ERROR: .notes directory is not readable: $NOTES_DIR" >&2
  echo "Please check permissions." >&2
  exit 1
fi

# Check if .notes is writable
if [ ! -w "$NOTES_DIR" ]; then
  echo "ERROR: .notes directory is not writable: $NOTES_DIR" >&2
  echo "Please check permissions." >&2
  exit 1
fi

# Success - echo the path
echo "$NOTES_DIR"
exit 0
