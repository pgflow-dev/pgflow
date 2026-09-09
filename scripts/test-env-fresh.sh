#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script_dir="$root/scripts"
lock_dir=$("$script_dir/lock-dir.sh")
environment_lock_file="$lock_dir/environment.lock"
integration_lock_file="$lock_dir/integration-db.lock"
canonical_root=$(cd "$root" && pwd -P)

declare -a stop_project_dirs=()
declare -a stack_lock_fds=()

# Nx-owned lifecycle targets this cleanup may stop. The exact workspace,
# project, and target come from Nx task environment variables, not argv.
owned_target() {
  case "$1" in
    edge-worker:test:integration|edge-worker:test:integration:file| \
    edge-worker:e2e|edge-worker:e2e:portable-runtimes|edge-worker:db:ensure| \
    edge-worker:test:lifecycle|edge-worker:supabase:start| \
    edge-worker:supabase:ensure-started|edge-worker:supabase:restart| \
    edge-worker:supabase:reset|edge-worker:supabase:stop| \
    core:test:pgtap|core:test:pgtap:file|core:verify-migrations| \
    core:verify-schemas-synced|core:gen-types|core:verify-gen-types| \
    core:supabase:start|core:supabase:ensure-started|core:supabase:restart| \
    core:supabase:reset|core:supabase:stop| \
    client:e2e|client:benchmark|client:supabase:prepare|client:supabase:start| \
    client:supabase:ensure-started|client:supabase:restart| \
    client:supabase:reset|client:supabase:stop| \
    website:dev:full|website:supabase:studio|website:supabase:start| \
    website:supabase:stop|cli:supabase:stop) return 0 ;;
    *) return 1 ;;
  esac
}

is_own_tree_process() {
  local pid=$1 reference=${PGFLOW_CLEANUP_PID:-$$} parent
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  [[ "$pid" == "$reference" ]] && return 0

  parent=$pid
  while [[ "$parent" =~ ^[0-9]+$ && "$parent" != 1 ]]; do
    [[ "$parent" == "$reference" ]] && return 0
    parent=$(awk '/^PPid:/{print $2}' "/proc/$parent/status" 2>/dev/null) || return 1
  done

  parent=$reference
  while [[ "$parent" =~ ^[0-9]+$ && "$parent" != 1 ]]; do
    [[ "$parent" == "$pid" ]] && return 0
    parent=$(awk '/^PPid:/{print $2}' "/proc/$parent/status" 2>/dev/null) || return 1
  done
  return 1
}

is_owned_test_process() {
  local pid=$1 process="/proc/$1" line uid workspace_root= project= target=
  local -a environ=()

  [[ "$pid" =~ ^[0-9]+$ && -r "$process/environ" ]] || return 1
  uid=$(awk '/^Uid:/{print $2; exit}' "$process/status" 2>/dev/null) || return 1
  [[ "$uid" == "$(id -u)" ]] || return 1

  mapfile -t environ < <(tr '\0' '\n' < "$process/environ" 2>/dev/null) || return 1
  for line in "${environ[@]}"; do
    case "$line" in
      NX_WORKSPACE_ROOT=*) workspace_root=${line#*=} ;;
      NX_TASK_TARGET_PROJECT=*) project=${line#*=} ;;
      NX_TASK_TARGET_TARGET=*) target=${line#*=} ;;
    esac
  done

  [[ "$workspace_root" == "$canonical_root" && -n "$project" && -n "$target" ]] || return 1
  owned_target "$project:$target" || return 1
  ! is_own_tree_process "$pid"
}

signal_owned_test_process() {
  /usr/bin/python3 - "$1" "$root/scripts/test-env-fresh.sh" <<'PY'
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

project_id_for() { # project_id_for <project-dir>
  sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' \
    "$1/supabase/config.toml" | head -1
}

acquire_stack_locks() {
  local project project_dir project_id fd
  local -a projects=()
  local -A seen_project_ids=()

  mapfile -t projects < <(pnpm nx show projects --withTarget=supabase:stop --json | jq -r '.[]' | LC_ALL=C sort)
  for project in "${projects[@]}"; do
    project_dir=$(pnpm nx show project "$project" --json | jq -r '.root')
    project_dir="$root/$project_dir"
    project_id=$(project_id_for "$project_dir")
    [[ "$project_id" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || {
      echo "Could not read a safe project_id for $project." >&2
      return 1
    }
    [[ -z "${seen_project_ids[$project_id]:-}" ]] || continue
    seen_project_ids[$project_id]=1

    exec {fd}>"$lock_dir/stack-${project_id}.lock"
    if ! flock -w 30 "$fd"; then
      echo "The '$project_id' stack lock is still held after 30s." >&2
      echo "Another worktree may be using it; fresh recovery will not stop it." >&2
      return 1
    fi
    stack_lock_fds+=("$fd")
    stop_project_dirs+=("$project_dir")
  done
}

stop_pgflow_stacks() {
  local project_dir
  for project_dir in "${stop_project_dirs[@]}"; do
    echo "Stopping Supabase stack in $project_dir"
    (cd "$project_dir" && pnpm exec supabase stop --no-backup)
  done
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
    && [[ "$(docker network inspect db_default --format '{{len .Containers}}')" == 0 ]]; then
    docker network rm db_default >/dev/null
  fi
}

main() {
  export PGFLOW_CLEANUP_PID=$$

  # Take environment first. A bounded retry stops only current-worktree Nx
  # holders; foreign resource locks remain a hard stop before destruction.
  exec 9>"$environment_lock_file"
  if ! flock -w 30 9; then
    stop_owned_test_processes
    flock -w 30 9 || {
      echo "Could not acquire the pgflow test-environment lock within 60s." >&2
      exit 1
    }
  fi

  stop_owned_test_processes
  acquire_stack_locks

  exec 8>"$integration_lock_file"
  if ! flock -w 30 8; then
    echo "The integration database lock is still held after 30s." >&2
    echo "Another worktree's suite may be using it; fresh recovery will not destroy it." >&2
    exit 1
  fi

  # All physical-resource locks are now held before any stop/remove command.
  stop_pgflow_stacks
  docker compose -f "$root/pkgs/edge-worker/tests/db/compose.yaml" down --volumes --remove-orphans
  remove_legacy_integration_db
  # core:test:pgtap holds stack-core.lock, acquired above, around this global
  # fixture. Do not remove it until that resource is demonstrably free.
  docker rm -f pgflow-upgrade-fixture >/dev/null 2>&1 || true

  echo "pgflow test environment is stopped and fresh. Test targets will start what they need."
}

if [[ "${1:-}" == "--is-owned-test-process" ]]; then
  (($# == 2)) || exit 2
  is_owned_test_process "$2"
elif [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
