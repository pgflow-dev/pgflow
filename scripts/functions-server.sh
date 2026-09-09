#!/usr/bin/env bash
# Function-server lifecycle management for edge-worker E2E runs. The caller
# owns the stack resource lock for this helper's complete lifetime.
set -euo pipefail

FUNCTIONS_SERVER_PID=
FUNCTIONS_SERVER_LOG=
FUNCTIONS_SERVER_CONTAINER_NAME=
FUNCTIONS_SERVER_PREVIOUS_CONTAINER_ID=
FUNCTIONS_SERVER_CONTAINER_ID=
FUNCTIONS_SERVER_TIMEOUT_SEC=${PGFLOW_SERVE_TIMEOUT_SEC:-120}
FUNCTIONS_SERVER_READY_LINE="Serving functions on http://"
FUNCTIONS_SERVER_WAITED=false
FUNCTIONS_SERVER_EXIT_STATUS=
FUNCTIONS_SERVER_COMMAND_PID=
FUNCTIONS_SERVER_COMMAND_WAITED=false
FUNCTIONS_SERVER_COMMAND_EXIT_STATUS=

process_alive() { # process_alive <pid>
  [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null
}

process_group_alive() { # process_group_alive <leader-pid>
  [[ -n "${1:-}" ]] && kill -0 -- "-$1" 2>/dev/null
}

current_container_id() { # current_container_id <container-name>
  local id status
  if id=$(docker inspect --format '{{.Id}}' "$1" 2>/dev/null); then
    [[ "$id" =~ ^[0-9a-f]{64}$ ]] || {
      echo "Function runtime container '$1' returned an invalid id." >&2
      return 2
    }
    printf '%s\n' "$id"
    return 0
  else
    status=$?
    return "$status"
  fi
}

observe_functions_server_container() {
  local id status
  [[ -n "$FUNCTIONS_SERVER_CONTAINER_NAME" ]] || return 0
  if id=$(current_container_id "$FUNCTIONS_SERVER_CONTAINER_NAME"); then
    # The first post-start ID is immutable ownership. Later replacements can
    # never be removed by this invocation's cleanup.
    if [[ -z "$FUNCTIONS_SERVER_CONTAINER_ID" && "$id" != "$FUNCTIONS_SERVER_PREVIOUS_CONTAINER_ID" ]]; then
      FUNCTIONS_SERVER_CONTAINER_ID=$id
    fi
    return 0
  fi
  status=$?
  # A missing runtime before creation or after cleanup is safe. Any malformed
  # successful inspect result already failed in current_container_id.
  [[ "$status" == 1 ]] && return 0
  return "$status"
}

start_functions_server() { # start_functions_server <runtime-container> <serve-command...>
  local id
  [[ $# -ge 2 ]] || {
    echo "Usage: start_functions_server <runtime-container> <serve-command...>" >&2
    return 2
  }
  FUNCTIONS_SERVER_CONTAINER_NAME=$1
  shift
  FUNCTIONS_SERVER_LOG=$(mktemp "${TMPDIR:-/tmp}/pgflow-functions-serve.XXXXXX.log")
  FUNCTIONS_SERVER_PREVIOUS_CONTAINER_ID=
  FUNCTIONS_SERVER_CONTAINER_ID=
  FUNCTIONS_SERVER_WAITED=false
  FUNCTIONS_SERVER_EXIT_STATUS=
  FUNCTIONS_SERVER_COMMAND_PID=
  FUNCTIONS_SERVER_COMMAND_WAITED=false
  FUNCTIONS_SERVER_COMMAND_EXIT_STATUS=

  # Record only the preexisting ID. A later different ID is the current
  # invocation's runtime and is safe to remove even if readiness never emits.
  if id=$(current_container_id "$FUNCTIONS_SERVER_CONTAINER_NAME"); then
    FUNCTIONS_SERVER_PREVIOUS_CONTAINER_ID=$id
  fi

  echo "Starting function server (log: $FUNCTIONS_SERVER_LOG)..."
  setsid "$@" >"$FUNCTIONS_SERVER_LOG" 2>&1 &
  FUNCTIONS_SERVER_PID=$!
}

functions_server_alive() {
  process_alive "$FUNCTIONS_SERVER_PID"
}

functions_server_exit_status() {
  [[ -n "$FUNCTIONS_SERVER_PID" ]] || return 0
  if [[ "$FUNCTIONS_SERVER_WAITED" != true ]]; then
    if wait "$FUNCTIONS_SERVER_PID"; then
      FUNCTIONS_SERVER_EXIT_STATUS=0
    else
      FUNCTIONS_SERVER_EXIT_STATUS=$?
    fi
    FUNCTIONS_SERVER_WAITED=true
  fi
  return "$FUNCTIONS_SERVER_EXIT_STATUS"
}

functions_server_failure() {
  local status
  functions_server_alive && return 1
  if functions_server_exit_status; then
    echo "Function server exited after startup with status 0." >&2
    return 1
  else
    status=$?
    echo "Function server exited after startup with status $status." >&2
    return "$status"
  fi
}

wait_for_functions_server() {
  echo "Waiting for the function server startup output..."
  local deadline=$((SECONDS + FUNCTIONS_SERVER_TIMEOUT_SEC))
  until grep -qF "$FUNCTIONS_SERVER_READY_LINE" "$FUNCTIONS_SERVER_LOG" 2>/dev/null; do
    observe_functions_server_container || return 1
    if ! functions_server_alive; then
      [[ -n "$FUNCTIONS_SERVER_CONTAINER_ID" ]] || \
        echo "No new function runtime container was observed before server exit." >&2
      echo "Function server exited before becoming ready. Server log:" >&2
      cat "$FUNCTIONS_SERVER_LOG" >&2
      return 1
    fi
    if ((SECONDS >= deadline)); then
      [[ -n "$FUNCTIONS_SERVER_CONTAINER_ID" ]] || \
        echo "No new function runtime container was observed before startup timeout." >&2
      echo "TIMEOUT: function server did not report readiness within ${FUNCTIONS_SERVER_TIMEOUT_SEC}s. Server log:" >&2
      cat "$FUNCTIONS_SERVER_LOG" >&2
      return 1
    fi
    sleep 0.2
  done

  observe_functions_server_container || return 1
  if ! functions_server_alive; then
    echo "Function server exited immediately after becoming ready. Server log:" >&2
    cat "$FUNCTIONS_SERVER_LOG" >&2
    return 1
  fi
  [[ -n "$FUNCTIONS_SERVER_CONTAINER_ID" ]] || {
    echo "No new runtime container appeared for this function-server invocation." >&2
    return 1
  }
  echo "Function server reported readiness from container $FUNCTIONS_SERVER_CONTAINER_ID."
}

stop_process_group() { # stop_process_group <leader-pid>
  local pid=$1
  process_group_alive "$pid" || return 0
  kill -TERM -- "-$pid" 2>/dev/null || true
  for _ in $(seq 1 50); do
    process_group_alive "$pid" || return 0
    sleep 0.1
  done
  kill -KILL -- "-$pid" 2>/dev/null || true
}

start_monitored_command() { # start_monitored_command <command...>
  [[ -z "$FUNCTIONS_SERVER_COMMAND_PID" ]] || {
    echo "A function-server command is already running." >&2
    return 1
  }
  setsid "$@" &
  FUNCTIONS_SERVER_COMMAND_PID=$!
  FUNCTIONS_SERVER_COMMAND_WAITED=false
  FUNCTIONS_SERVER_COMMAND_EXIT_STATUS=
}

monitored_command_exit_status() {
  [[ -n "$FUNCTIONS_SERVER_COMMAND_PID" ]] || return 0
  if [[ "$FUNCTIONS_SERVER_COMMAND_WAITED" != true ]]; then
    if wait "$FUNCTIONS_SERVER_COMMAND_PID"; then
      FUNCTIONS_SERVER_COMMAND_EXIT_STATUS=0
    else
      FUNCTIONS_SERVER_COMMAND_EXIT_STATUS=$?
    fi
    FUNCTIONS_SERVER_COMMAND_WAITED=true
  fi
  return "$FUNCTIONS_SERVER_COMMAND_EXIT_STATUS"
}

clear_monitored_command() {
  FUNCTIONS_SERVER_COMMAND_PID=
  FUNCTIONS_SERVER_COMMAND_WAITED=false
  FUNCTIONS_SERVER_COMMAND_EXIT_STATUS=
}

stop_monitored_command() {
  [[ -n "$FUNCTIONS_SERVER_COMMAND_PID" ]] || return 0
  # The leader remains unreaped until the following wait, so its process-group
  # ID cannot be reused while this cleanup signals its children.
  stop_process_group "$FUNCTIONS_SERVER_COMMAND_PID"
  monitored_command_exit_status || true
  clear_monitored_command
}

remove_owned_functions_container() {
  local status
  [[ -n "$FUNCTIONS_SERVER_CONTAINER_ID" ]] || return 0
  if docker rm -f "$FUNCTIONS_SERVER_CONTAINER_ID" >/dev/null 2>&1; then
    echo "Removed owned function runtime container $FUNCTIONS_SERVER_CONTAINER_ID."
    return 0
  else
    status=$?
  fi
  # Container IDs never identify a replacement. If it disappeared already,
  # cleanup completed without touching any later runtime.
  if ! docker inspect "$FUNCTIONS_SERVER_CONTAINER_ID" >/dev/null 2>&1; then
    echo "Owned function runtime container $FUNCTIONS_SERVER_CONTAINER_ID was already gone."
    return 0
  fi
  echo "Failed to remove owned function runtime container $FUNCTIONS_SERVER_CONTAINER_ID." >&2
  return "$status"
}

stop_functions_server() {
  local failed=0
  # Capture a runtime created just before a timeout or early child exit.
  observe_functions_server_container || failed=1
  stop_monitored_command
  [[ -n "$FUNCTIONS_SERVER_PID" ]] && stop_process_group "$FUNCTIONS_SERVER_PID"
  observe_functions_server_container || failed=1
  functions_server_exit_status || true
  remove_owned_functions_container || failed=1
  return "$failed"
}

run_with_functions_server() { # run_with_functions_server <command...>
  local command_status server_status
  start_monitored_command "$@"

  while process_alive "$FUNCTIONS_SERVER_COMMAND_PID"; do
    observe_functions_server_container || {
      stop_monitored_command
      return 1
    }
    if ! functions_server_alive; then
      if functions_server_failure; then server_status=0; else server_status=$?; fi
      stop_monitored_command
      [[ "$server_status" == 0 ]] && return 1
      return "$server_status"
    fi
    sleep 0.1
  done

  if monitored_command_exit_status; then command_status=0; else command_status=$?; fi
  clear_monitored_command
  if ! functions_server_alive; then
    if functions_server_failure; then server_status=0; else server_status=$?; fi
    [[ "$server_status" == 0 ]] && return 1
    return "$server_status"
  fi
  return "$command_status"
}

self_test() {
  local failures=0 status tmp old_id new_id replacement_id docker_mode=false docker_rm_fails=false
  tmp=$(mktemp -d)
  old_id=$(printf 'b%.0s' {1..64})
  new_id=$(printf 'a%.0s' {1..64})
  replacement_id=$(printf 'c%.0s' {1..64})

  docker() {
    printf '%s\n' "$*" >>"$tmp/docker-calls"
    case "$1" in
      inspect)
        case "$docker_mode" in
          old) printf '%s\n' "$old_id" ;;
          new|rm-fails) printf '%s\n' "$new_id" ;;
          replacement) printf '%s\n' "$replacement_id" ;;
          none) return 1 ;;
          invalid) printf '%s\n' invalid-id ;;
        esac
        ;;
      rm)
        [[ "$docker_rm_fails" == true ]] && return 1
        docker_mode=none
        ;;
    esac
  }

  begin_server() { # begin_server <command...>
    docker_mode=old
    start_functions_server supabase_edge_runtime_selftest "$@"
    docker_mode=new
  }
  expect_status() {
    local name=$1 want=$2
    shift 2
    if "$@"; then status=0; else status=$?; fi
    if [[ "$status" == "$want" ]]; then
      echo "ok   $name"
    else
      echo "FAIL $name (expected exit $want, got $status)"
      failures=$((failures + 1))
    fi
  }

  begin_server bash -c 'exit 7'
  expect_status "early server exit fails" 1 wait_for_functions_server
  if [[ "$FUNCTIONS_SERVER_CONTAINER_ID" == "$new_id" ]]; then
    echo "ok   early exit captures a newly created runtime before cleanup"
  else
    echo "FAIL early exit did not capture a newly created runtime"
    failures=$((failures + 1))
  fi
  expect_status "early-exit cleanup removes the captured runtime" 0 stop_functions_server

  FUNCTIONS_SERVER_TIMEOUT_SEC=1
  begin_server bash -c 'exec 1>&- 2>&-; exec sleep 30'
  expect_status "startup deadline fails" 1 wait_for_functions_server
  if [[ "$FUNCTIONS_SERVER_CONTAINER_ID" == "$new_id" ]]; then
    echo "ok   timeout captures a newly created runtime before cleanup"
  else
    echo "FAIL timeout did not capture a newly created runtime"
    failures=$((failures + 1))
  fi
  expect_status "timeout cleanup removes the captured runtime" 0 stop_functions_server

  FUNCTIONS_SERVER_TIMEOUT_SEC=10
  begin_server bash -c '
    echo "Serving functions on http://127.0.0.1:9999/functions/v1/x"
    trap "exit 0" TERM
    sleep 30 &
    echo $! > "'"$tmp"'/server-child.pid"
    wait'
  expect_status "ready server passes startup" 0 wait_for_functions_server
  stop_functions_server
  if kill -0 "$(cat "$tmp/server-child.pid")" 2>/dev/null; then
    echo "FAIL server cleanup left a process-group child alive"
    failures=$((failures + 1))
  else
    echo "ok   server cleanup stops a process-group child after leader handling"
  fi

  begin_server bash -c '
    echo "Serving functions on http://127.0.0.1:9999/functions/v1/x"
    sleep 0.2
    exit 7'
  expect_status "ready-then-exit fails the monitored command" 7 \
    run_with_functions_server bash -c 'sleep 1'
  stop_functions_server

  begin_server bash -c 'echo "Serving functions on http://127.0.0.1:9999/functions/v1/x"; exec sleep 30'
  expect_status "probe failure status survives" 0 wait_for_functions_server
  expect_status "probe failure returns its status" 9 \
    run_with_functions_server bash -c 'exit 9'
  stop_functions_server

  begin_server bash -c 'echo "Serving functions on http://127.0.0.1:9999/functions/v1/x"; exec sleep 30'
  expect_status "suite failure status survives" 0 wait_for_functions_server
  expect_status "suite failure returns its status" 11 \
    run_with_functions_server bash -c 'exit 11'
  stop_functions_server

  : >"$tmp/docker-calls"
  begin_server bash -c 'echo "Serving functions on http://127.0.0.1:9999/functions/v1/x"; exec sleep 30'
  expect_status "container owner reaches readiness" 0 wait_for_functions_server
  stop_functions_server
  if grep -qx "rm -f $new_id" "$tmp/docker-calls" \
    && ! grep -qx 'rm -f supabase_edge_runtime_selftest' "$tmp/docker-calls"; then
    echo "ok   cleanup removes only the captured runtime container id"
  else
    echo "FAIL cleanup did not remove only the captured runtime container id"
    failures=$((failures + 1))
  fi

  : >"$tmp/docker-calls"
  begin_server bash -c 'echo "Serving functions on http://127.0.0.1:9999/functions/v1/x"; exec sleep 30'
  expect_status "first owned runtime reaches readiness" 0 wait_for_functions_server
  docker_mode=replacement
  expect_status "later runtime observation succeeds" 0 observe_functions_server_container
  if [[ "$FUNCTIONS_SERVER_CONTAINER_ID" == "$new_id" ]]; then
    echo "ok   later runtime replacement cannot transfer container ownership"
  else
    echo "FAIL later runtime replacement changed owned container id"
    failures=$((failures + 1))
  fi
  stop_functions_server
  if grep -qx "rm -f $new_id" "$tmp/docker-calls" \
    && ! grep -qx "rm -f $replacement_id" "$tmp/docker-calls"; then
    echo "ok   B-to-C replacement cleanup removes B and never C"
  else
    echo "FAIL B-to-C replacement cleanup did not preserve B ownership"
    failures=$((failures + 1))
  fi

  begin_server bash -c 'echo "Serving functions on http://127.0.0.1:9999/functions/v1/x"; exec sleep 30'
  expect_status "cleanup-failure server reaches readiness" 0 wait_for_functions_server
  docker_rm_fails=true
  docker_mode=rm-fails
  expect_status "container cleanup failure fails a successful invocation" 1 stop_functions_server
  docker_rm_fails=false
  expect_status "failed cleanup can remove the same exact id later" 0 stop_functions_server

  (
    docker_mode=old
    start_functions_server supabase_edge_runtime_selftest bash -c 'echo "Serving functions on http://127.0.0.1:9999/functions/v1/x"; exec sleep 30'
    docker_mode=new
    wait_for_functions_server
    cleanup_interrupted_suite() {
      local interrupted_status=$?
      stop_functions_server || true
      exit "$interrupted_status"
    }
    trap cleanup_interrupted_suite EXIT
    trap 'exit 143' TERM
    start_monitored_command bash -c 'sleep 30 & echo $! > "'"$tmp"'/suite-child.pid"; wait'
    echo ready >"$tmp/interrupted-suite-ready"
    sleep 30
  ) &
  interrupted_suite=$!
  for _ in $(seq 1 50); do
    [[ -f "$tmp/interrupted-suite-ready" ]] && break
    sleep 0.1
  done
  if [[ -f "$tmp/interrupted-suite-ready" ]]; then
    kill -TERM "$interrupted_suite"
    wait "$interrupted_suite" 2>/dev/null || true
    if kill -0 "$(cat "$tmp/suite-child.pid")" 2>/dev/null; then
      echo "FAIL interrupted suite cleanup left its command group alive"
      failures=$((failures + 1))
    else
      echo "ok   interrupted suite cleanup stops the monitored command group"
    fi
  else
    echo "FAIL interrupted suite did not reach the monitored command"
    failures=$((failures + 1))
    kill -KILL "$interrupted_suite" 2>/dev/null || true
    wait "$interrupted_suite" 2>/dev/null || true
  fi

  rm -rf "$tmp"
  if [[ "$failures" -eq 0 ]]; then
    echo "functions-server self-test passed."
    return 0
  fi
  echo "$failures functions-server self-test check(s) failed." >&2
  return 1
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
elif [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "Source this file from scripts/run-e2e.sh (or run --self-test)." >&2
  exit 2
fi
