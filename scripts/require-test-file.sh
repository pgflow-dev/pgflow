#!/usr/bin/env bash
# Validates a focused test-file selector before a runner receives it. The
# direct-argv Nx executor passes this value as data; this script enforces a
# canonical supported subtree and checks Nx's effective file visibility.
set -euo pipefail

usage() {
  echo "Usage: $0 <subtree> <file>" >&2
}

[[ $# -eq 2 ]] || {
  usage
  exit 2
}
subtree=$1
file=$2

[[ -n "$file" ]] || {
  echo "ERROR: no test file selected." >&2
  exit 1
}
[[ "$file" != /* ]] || {
  echo "ERROR: test file must be relative to the package root: $file" >&2
  exit 1
}
# This is selector hygiene, not shell escaping. Quotes, substitutions, and
# options are data in the direct-argv executor and are rejected here.
[[ "$file" =~ ^[A-Za-z0-9_./-]+$ ]] || {
  echo "ERROR: test file contains unsupported characters: $file" >&2
  exit 1
}

[[ "$file" != ./* ]] || file=${file#./}
[[ "$file" == "$subtree"/* ]] || {
  echo "ERROR: test file must be inside $subtree/: $file" >&2
  exit 1
}
case "$subtree" in
  supabase/tests) [[ "$file" == *.sql ]] ;;
  tests/integration) [[ "$file" == *.ts ]] ;;
  *) true ;;
esac || {
  echo "ERROR: test file has an unsupported extension: $file" >&2
  exit 1
}

resolved=$(readlink -f -- "$file" 2>/dev/null) || {
  echo "ERROR: test file not found: $file" >&2
  exit 1
}
subtree_resolved=$(readlink -f -- "$subtree" 2>/dev/null) || {
  echo "ERROR: test subtree not found: $subtree" >&2
  exit 1
}
[[ "$resolved" == "$subtree_resolved"/* && -f "$resolved" ]] || {
  echo "ERROR: not a regular file inside $subtree/: $file" >&2
  exit 1
}

if repo_root=$(git rev-parse --show-toplevel 2>/dev/null); then
  repo_file=$(realpath --relative-to="$repo_root" "$resolved")
  [[ "$repo_file" != ../* ]] || {
    echo "ERROR: test file is outside the repository: $file" >&2
    exit 1
  }
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  if ! node "$script_dir/nx-file-visible.cjs" "$repo_root" "$repo_file"; then
    echo "ERROR: test file is ignored by Nx and cannot be hashed: $file" >&2
    exit 1
  fi
fi
