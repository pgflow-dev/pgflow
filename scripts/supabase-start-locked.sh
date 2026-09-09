#!/usr/bin/env bash
# Public locked entry point for one physical Supabase stack. The stack lock is
# keyed by config.toml project_id, not by a worktree path.
set -euo pipefail

restart=()
if [[ "${1:-}" == "--restart" ]]; then
  restart=(--restart)
  shift
fi
[[ $# -eq 1 && -d "$1" ]] || {
  echo "Usage: $0 [--restart] <project-directory>" >&2
  exit 2
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project_dir=$(realpath "$1")
exec "$script_dir/with-supabase-lock.sh" "$project_dir" \
  "$script_dir/supabase-start.sh" "${restart[@]}" "$project_dir"
