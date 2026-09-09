#!/usr/bin/env bash
# Owns one edge-worker E2E invocation: current migration preparation, stack
# materialization, function serve, readiness, suite, and exact-resource cleanup.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_dir=${1:?Usage: run-e2e.sh <tests-directory>}
# shellcheck source=scripts/functions-server.sh
source "$root/scripts/functions-server.sh"

cd "$root/pkgs/edge-worker"
project_id=$(sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' supabase/config.toml | head -1)
[[ "$project_id" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || {
  echo "Could not read a safe edge-worker project_id." >&2
  exit 1
}
lock_dir=$("$root/scripts/lock-dir.sh")

# Every operation and live consumer of this physical stack uses this same
# project_id lock. The environment lock always comes first.
exec 9>"$lock_dir/environment.lock"
flock --shared 9
exec 8>"$lock_dir/stack-${project_id}.lock"
flock 8

# The lock-assuming body starts the stack after edge-worker copies the current
# core migrations, then fingerprints and applies the live database.
"$root/scripts/ensure-migrations-body.sh" .
./scripts/sync-e2e-deps.sh

cleanup() {
  local status=$? cleanup_status=0
  trap - EXIT INT TERM
  if stop_functions_server; then :; else cleanup_status=$?; fi
  if [[ "$status" == 0 && "$cleanup_status" != 0 ]]; then
    status=$cleanup_status
  fi
  exit "$status"
}
# Install cleanup before spawning the serve process or probing its runtime.
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

start_functions_server "supabase_edge_runtime_${project_id}" \
  pnpm exec supabase functions serve \
  --env-file supabase/functions/.env \
  --import-map supabase/functions/deno.json \
  --no-verify-jwt
wait_for_functions_server

run_with_functions_server "$root/scripts/wait-for-function.sh" \
  http://127.0.0.1:50321/functions/v1/auth_test 401 '"message":"Unauthorized"'

set +e
run_with_functions_server deno test --config deno.test.json --allow-all \
  --env=supabase/functions/.env "$test_dir"
status=$?
set -e
exit "$status"
