#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE=/tmp/pgflow-test-environment.lock

has_test_path() {
  local arg prefix=$1
  shift

  for arg; do
    case "$arg" in
      "$prefix"|"$prefix/"|"$prefix/"*) return 0 ;;
    esac
  done
  return 1
}

is_same_path() {
  local cwd=$1 actual=$2 expected=$3 actual_path expected_path

  [[ "$actual" == /* ]] || actual="$cwd/$actual"
  actual_path=$(readlink -f -- "$actual" 2>/dev/null) || return 1
  expected_path=$(readlink -f -- "$expected" 2>/dev/null) || return 1
  [[ "$actual_path" == "$expected_path" ]]
}

is_vitest_entrypoint() {
  local cwd=$1 package=$2 entrypoint=$3

  is_same_path "$cwd" "$entrypoint" "$ROOT/node_modules/vitest/vitest.mjs" \
    || is_same_path "$cwd" "$entrypoint" "$ROOT/pkgs/$package/node_modules/vitest/vitest.mjs"
}

is_owned_test_command() {
  local cwd=$1 executable=${2##*/}
  shift 2
  local -a argv=("$@")

  case "$cwd:$executable" in
    "$ROOT/pkgs/edge-worker:supabase"|"$ROOT/pkgs/cli:supabase")
      [[ "${argv[1]:-}" == "functions" && "${argv[2]:-}" == "serve" ]]
      ;;
    "$ROOT/pkgs/edge-worker:deno")
      [[ "${argv[1]:-}" == "test" ]] || return 1
      has_test_path tests/integration "${argv[@]:2}" \
        || has_test_path tests/e2e "${argv[@]:2}" \
        || has_test_path tests/e2e-portable-runtimes "${argv[@]:2}"
      ;;
    "$ROOT/pkgs/cli:vitest"|"$ROOT/pkgs/client:vitest")
      [[ "${argv[1]:-}" == "run" ]] \
        && has_test_path __tests__/e2e "${argv[@]:2}"
      ;;
    "$ROOT/pkgs/cli:node"|"$ROOT/pkgs/cli:nodejs")
      is_vitest_entrypoint "$cwd" cli "${argv[1]:-}" \
        && [[ "${argv[2]:-}" == "run" ]] \
        && has_test_path __tests__/e2e "${argv[@]:3}"
      ;;
    "$ROOT/pkgs/client:node"|"$ROOT/pkgs/client:nodejs")
      is_vitest_entrypoint "$cwd" client "${argv[1]:-}" \
        && [[ "${argv[2]:-}" == "run" ]] \
        && has_test_path __tests__/e2e "${argv[@]:3}"
      ;;
    "$ROOT/pkgs/edge-worker:node"|"$ROOT/pkgs/edge-worker:nodejs"|"$ROOT/pkgs/edge-worker:bun")
      ((${#argv[@]} == 2)) \
        && is_same_path "$cwd" "${argv[1]:-}" "$ROOT/pkgs/edge-worker/tests/e2e-portable-runtimes/portable-process-worker.mjs"
      ;;
    *) return 1 ;;
  esac
}

is_owned_test_process() {
  local pid=$1 process="/proc/$1" cwd executable
  local -a argv=()

  [[ "$pid" =~ ^[0-9]+$ && "$pid" != "$$" && -r "$process/cmdline" ]] || return 1
  mapfile -d '' -t argv 2>/dev/null < "$process/cmdline" || return 1
  ((${#argv[@]} > 0)) || return 1

  cwd=$(readlink "$process/cwd" 2>/dev/null) || return 1
  executable=$(readlink "$process/exe" 2>/dev/null) || return 1
  is_owned_test_command "$cwd" "$executable" "${argv[@]}"
}

# Keep one pidfd across both signals, but recheck the command before each one.
signal_owned_test_process() {
  /usr/bin/python3 - "$1" "$ROOT/scripts/test-env-fresh.sh" <<'PY'
import os
import select
import signal
import subprocess
import sys

pid = int(sys.argv[1])
script = sys.argv[2]

try:
    pidfd = os.pidfd_open(pid)
except ProcessLookupError:
    sys.exit()


def is_owned():
    return subprocess.run(
        [script, "--is-owned-test-process", str(pid)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ).returncode == 0


if not is_owned():
    sys.exit()

try:
    signal.pidfd_send_signal(pidfd, signal.SIGTERM)
except ProcessLookupError:
    sys.exit()

poller = select.poll()
poller.register(pidfd, select.POLLIN)
if poller.poll(5000) or not is_owned():
    sys.exit()

try:
    signal.pidfd_send_signal(pidfd, signal.SIGKILL)
except ProcessLookupError:
    pass
PY
}

stop_owned_test_processes() {
  local pid process signaler found=false failed=false
  local -a signalers=()

  for process in /proc/[0-9]*; do
    pid=${process##*/}
    is_owned_test_process "$pid" || continue
    echo "Stopping pgflow test process: $pid"
    signal_owned_test_process "$pid" &
    signalers+=("$!")
    found=true
  done

  [[ "$found" == true ]] || return 0
  for signaler in "${signalers[@]}"; do
    wait "$signaler" || failed=true
  done
  [[ "$failed" == false ]]
}

remove_legacy_integration_db() {
  local config container removed=false

  while read -r container; do
    [[ -n "$container" ]] || continue
    config=$(docker inspect "$container" --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null || true)
    case "$config" in
      */pgflow/worktrees/*/pkgs/edge-worker/tests/db/compose.yaml|*/pgflow/pkgs/edge-worker/tests/db/compose.yaml)
        echo "Removing legacy pgflow edge-worker integration container $container"
        docker rm -fv "$container" >/dev/null
        removed=true
        ;;
    esac
  done < <(docker ps -aq --filter label=com.docker.compose.project=db)

  if [[ "$removed" == true ]] \
    && docker network inspect db_default >/dev/null 2>&1 \
    && [[ "$(docker network inspect db_default --format '{{len .Containers}}')" == "0" ]]; then
    docker network rm db_default >/dev/null
  fi
}

main() {
  exec 9>"$LOCK_FILE"
  flock 9

  stop_owned_test_processes

  pnpm nx run-many --target=supabase:stop --parallel=false --outputStyle=static

  docker compose -f "$ROOT/pkgs/edge-worker/tests/db/compose.yaml" down --volumes --remove-orphans
  remove_legacy_integration_db
  docker rm -f pgflow-upgrade-fixture >/dev/null 2>&1 || true

  echo "pgflow test environment is stopped and fresh. Test targets will start what they need."
}

if [[ "${1:-}" == "--is-owned-test-process" ]]; then
  (($# == 2)) || exit 2
  is_owned_test_process "$2"
elif [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
