#!/usr/bin/env bash
set -euo pipefail

# summarize-notes - Add AI summaries to note listings
# Usage: list-titles.sh scratch/ | summarize-notes.sh
#    or: search-notes.sh "pattern" | summarize-notes.sh
#
# Expected input format:
#   Line 1: Header (e.g., "PATH | TITLE")
#   Line 2+: Data rows (e.g., ".notes/foo.md | My Note")
#   If only header exists (no data rows), means no notes found
#
# Adds SUMMARY column with fast AI-generated summaries (parallel processing)

# Model and prompt
MODEL="groq:meta-llama/llama-4-scout-17b-16e-instruct"
PROMPT="summarize this file in two sentences, only output summary"

# Check if 'parallel' is available
if ! command -v parallel &> /dev/null; then
  echo "Error: GNU parallel not installed. Install with: sudo pacman -S parallel" >&2
  exit 1
fi

# Check if 'aichat' command is available
if ! command -v aichat &> /dev/null; then
  echo "Error: 'aichat' command not found. Make sure it's installed and in PATH." >&2
  exit 1
fi

# Process a single line
process_line() {
  local line="$1"
  local line_number="$2"
  # Use exported MODEL and PROMPT environment variables

  # First line is always the header - append SUMMARY column
  if [ "$line_number" -eq 1 ]; then
    echo "$line | SUMMARY"
    return
  fi

  # Extract path (everything before first |)
  local path="${line%%|*}"
  # Trim whitespace (bash parameter expansion)
  path="${path#"${path%%[![:space:]]*}"}"
  path="${path%"${path##*[![:space:]]}"}"

  # Skip if file doesn't exist
  if [ ! -f "$path" ]; then
    return # Skip failed files silently
  fi

  # Get summary (pass prompt as separate words, not quoted)
  local summary
  summary=$(aichat --model "$MODEL" -f "$path" $PROMPT 2>/dev/null || echo "")

  # Skip if summary failed
  if [ -z "$summary" ]; then
    return
  fi

  # Collapse multiline to single line (replace newlines with spaces, collapse multiple spaces)
  summary=$(echo "$summary" | tr '\n' ' ' | sed 's/  */ /g')
  # Trim whitespace (bash parameter expansion)
  summary="${summary#"${summary%%[![:space:]]*}"}"
  summary="${summary%"${summary##*[![:space:]]}"}"

  # Append summary
  echo "$line | $summary"
}

export -f process_line
export MODEL PROMPT

# Read stdin, number lines, and process in parallel (16 jobs)
cat -n | parallel -j 16 --keep-order --colsep '\t' process_line {2} {1}
