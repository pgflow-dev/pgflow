#!/usr/bin/env bash
# Runs a command while holding the pgflow lock for one physical Supabase stack.
# Lock order is fixed: shared environment first, then the project_id resource.
set -euo pipefail

[[ $# -ge 2 ]] || {
  echo "Usage: $0 <project-dir> <command> [args...]" >&2
  exit 2
}

project_dir=$1
shift
[[ -d "$project_dir" ]] || {
  echo "Project directory not found: $project_dir" >&2
  exit 1
}
project_dir=$(realpath "$project_dir")
config="$project_dir/supabase/config.toml"
[[ -f "$config" ]] || {
  echo "Supabase config not found: $config" >&2
  exit 1
}
project_id=$(sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$config" | head -1)
[[ "$project_id" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || {
  echo "Could not read a safe project_id from $config." >&2
  exit 1
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
lock_dir=$("$script_dir/lock-dir.sh")

exec 9>"$lock_dir/environment.lock"
flock --shared 9
exec 8>"$lock_dir/stack-${project_id}.lock"
flock 8

cd "$project_dir"
exec "$@"
