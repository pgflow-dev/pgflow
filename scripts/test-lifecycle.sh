#!/usr/bin/env bash
# Deterministic lifecycle regression checks. They touch no live database or
# shared stack: temporary files, lock contention, selector validation, and
# process ownership only.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scripts="$root/scripts"
tmp=$(mktemp -d)
repo_visible="$root/pkgs/core/supabase/tests/nx-visible-lifecycle.test.sql"
repo_ignored="$root/pkgs/edge-worker/tests/integration/.env-nx-ignored-lifecycle.test.ts"
trap 'rm -rf "$tmp" "$repo_visible" "$repo_ignored"' EXIT
failures=0

check() { # check <name> <expected-status> <command...>
  local name=$1 expected=$2 status
  shift 2
  if "$@" >/dev/null 2>&1; then status=0; else status=$?; fi
  if [[ "$status" -eq "$expected" ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name (expected exit $expected, got $status)"
    failures=$((failures + 1))
  fi
}

common_dir=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)
from_root=$("$scripts/lock-dir.sh")
from_pkg=$(cd "$root/pkgs/edge-worker" && "$scripts/lock-dir.sh")
if [[ "$from_root" == "$common_dir/pgflow-locks" && "$from_root" == "$from_pkg" ]]; then
  echo "ok   lock-dir resolves to the shared git common dir from any cwd"
else
  echo "FAIL lock-dir: root='$from_root' pkg='$from_pkg' expected='$common_dir/pgflow-locks'"
  failures=$((failures + 1))
fi

# Two worktree paths with one project_id must contend on one stack lock.
mkdir -p "$tmp/stack-a/supabase" "$tmp/stack-b/supabase"
printf 'project_id = "shared-stack"\n' >"$tmp/stack-a/supabase/config.toml"
printf 'project_id = "shared-stack"\n' >"$tmp/stack-b/supabase/config.toml"
"$scripts/with-supabase-lock.sh" "$tmp/stack-a" sleep 3 &
stack_holder=$!
sleep 0.3
check "same project_id stack lock spans worktree paths" 124 \
  timeout 2 "$scripts/with-supabase-lock.sh" "$tmp/stack-b" true
wait "$stack_holder"
check "stack lock releases after its consumer exits" 0 \
  "$scripts/with-supabase-lock.sh" "$tmp/stack-b" true

client_prepare_command=$(jq -r '.targets["supabase:prepare"].options.command // empty' "$root/pkgs/client/project.json")
if [[ "$client_prepare_command" == "../../scripts/with-supabase-lock.sh ."* ]]; then
  echo "ok   client migration preparation invokes the stack lock wrapper"
else
  echo "FAIL client migration preparation does not invoke the stack lock wrapper"
  failures=$((failures + 1))
fi
"$scripts/with-supabase-lock.sh" "$root/pkgs/client" sleep 3 &
client_prepare_holder=$!
sleep 0.3
check "client preparation stack lock blocks a concurrent mutator" 124 \
  timeout 2 "$scripts/with-supabase-lock.sh" "$root/pkgs/client" true
wait "$client_prepare_holder"
check "client preparation stack lock releases after its consumer exits" 0 \
  "$scripts/with-supabase-lock.sh" "$root/pkgs/client" true

integration_lock="$from_root/integration-db.lock"
flock "$integration_lock" -c 'sleep 3' &
integration_holder=$!
sleep 0.3
check "integration resource lock blocks a second holder" 124 \
  timeout 2 "$scripts/with-integration-lock.sh" true
wait "$integration_holder"
check "integration lock releases after its consumer exits" 0 \
  "$scripts/with-integration-lock.sh" true

mkdir -p "$tmp/sub"
echo test >"$tmp/sub/real.test.ts"
ln -s /etc/hostname "$tmp/sub/escape.test.ts"
check "valid file accepted" 0 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub sub/real.test.ts"
check "./-prefixed valid file accepted" 0 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub ./sub/real.test.ts"
check "empty selector rejected" 1 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub ''"
check "missing file rejected" 1 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub sub/absent.test.ts"
check "absolute path rejected" 1 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub '$tmp/sub/real.test.ts'"
check "quote selector rejected" 1 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub 'sub/real.test.ts;touch-x'"
check "external file rejected" 1 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub ../etc/hostname"
check "traversal outside subtree rejected" 1 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub sub/../../etc/hostname"
check "symlink escape rejected" 1 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub sub/escape.test.ts"
check "directory rejected" 1 sh -c "cd '$tmp' && '$scripts/require-test-file.sh' sub sub"

# Nx hashes nonignored files before Git tracks them. It can also reinclude an
# otherwise Git-ignored path through .nxignore, so this check uses Nx's own
# file map instead of Git's tracked/ignored status.
printf '%s\n' '-- lifecycle visibility probe' >"$repo_visible"
printf '%s\n' 'Deno.test("ignored", () => {});' >"$repo_ignored"
check "new nonignored in-tree test is visible to Nx" 0 \
  sh -c "cd '$root/pkgs/core' && '$scripts/require-test-file.sh' supabase/tests supabase/tests/nx-visible-lifecycle.test.sql"
check "Nx re-included edge .env is visible" 0 \
  node "$scripts/nx-file-visible.cjs" "$root" pkgs/edge-worker/supabase/functions/.env
check "actual Nx-ignored test is rejected" 1 \
  sh -c "cd '$root/pkgs/edge-worker' && '$scripts/require-test-file.sh' tests/integration tests/integration/.env-nx-ignored-lifecycle.test.ts"

start_test_proc() { # start_test_proc <pidfile> <env assignments...>
  local pidfile=$1
  shift
  env -i "PATH=$PATH" "$@" \
    bash -c "echo \$BASHPID >'$pidfile'; exec 1>&- 2>&-; exec sleep 5" &
  test_proc_bg=$!
}

stop_test_proc() {
  kill "$(cat "$1")" 2>/dev/null || true
  wait "$test_proc_bg" 2>/dev/null || true
}

start_focused_cancellation_proc() { # start_focused_cancellation_proc <pidfile>
  local pidfile=$1
  env -i "PATH=$PATH" "NX_WORKSPACE_ROOT=$root" \
    NX_TASK_TARGET_PROJECT=edge-worker \
    NX_TASK_TARGET_TARGET=test:integration:file \
    bash -c 'trap "exit 0" TERM; sleep 30 & child=$!; printf "%s %s\n" "$BASHPID" "$child" >"$1"; wait "$child"' \
    _ "$pidfile" &
  focused_cancellation_bg=$!
}

start_test_proc "$tmp/owned.pid" \
  "NX_WORKSPACE_ROOT=$root" \
  NX_TASK_TARGET_PROJECT=edge-worker \
  NX_TASK_TARGET_TARGET=test:integration
sleep 0.3
pid=$(cat "$tmp/owned.pid")
check "owned target process matches" 0 "$scripts/test-env-fresh.sh" --is-owned-test-process "$pid"
check "own-tree exclusion matches cleanup pid" 1 env "PGFLOW_CLEANUP_PID=$pid" \
  "$scripts/test-env-fresh.sh" --is-owned-test-process "$pid"
stop_test_proc "$tmp/owned.pid"

start_focused_cancellation_proc "$tmp/focused-cancellation.pid"
for _ in $(seq 1 50); do
  [[ -f "$tmp/focused-cancellation.pid" ]] && break
  sleep 0.1
done
if [[ -f "$tmp/focused-cancellation.pid" ]]; then
  read -r focused_pid focused_child <"$tmp/focused-cancellation.pid"
  check "focused Nx task process matches recovery ownership" 0 \
    "$scripts/test-env-fresh.sh" --is-owned-test-process "$focused_pid"
  check "focused Nx cancellation stops the owned process tree" 0 \
    bash -ceu 'source "$1"; stop_owned_test_processes' _ "$scripts/test-env-fresh.sh"
  wait "$focused_cancellation_bg" 2>/dev/null || true
  if ! kill -0 "$focused_pid" 2>/dev/null && ! kill -0 "$focused_child" 2>/dev/null; then
    echo "ok   focused Nx cancellation leaves no owned child"
  else
    echo "FAIL focused Nx cancellation left an owned child"
    failures=$((failures + 1))
  fi
else
  echo "FAIL focused Nx cancellation test did not start"
  failures=$((failures + 1))
  kill "$focused_cancellation_bg" 2>/dev/null || true
  wait "$focused_cancellation_bg" 2>/dev/null || true
fi

start_test_proc "$tmp/client-prepare.pid" \
  "NX_WORKSPACE_ROOT=$root" \
  NX_TASK_TARGET_PROJECT=client \
  NX_TASK_TARGET_TARGET=supabase:prepare
sleep 0.3
pid=$(cat "$tmp/client-prepare.pid")
check "client migration preparation lifecycle consumer matches" 0 \
  "$scripts/test-env-fresh.sh" --is-owned-test-process "$pid"
stop_test_proc "$tmp/client-prepare.pid"

start_test_proc "$tmp/benchmark.pid" \
  "NX_WORKSPACE_ROOT=$root" \
  NX_TASK_TARGET_PROJECT=client \
  NX_TASK_TARGET_TARGET=benchmark
sleep 0.3
pid=$(cat "$tmp/benchmark.pid")
check "client benchmark lifecycle consumer matches" 0 \
  "$scripts/test-env-fresh.sh" --is-owned-test-process "$pid"
stop_test_proc "$tmp/benchmark.pid"

start_test_proc "$tmp/noenv.pid"
sleep 0.3
pid=$(cat "$tmp/noenv.pid")
check "process without Nx task environment does not match" 1 \
  "$scripts/test-env-fresh.sh" --is-owned-test-process "$pid"
stop_test_proc "$tmp/noenv.pid"

start_test_proc "$tmp/nontarget.pid" \
  "NX_WORKSPACE_ROOT=$root" \
  NX_TASK_TARGET_PROJECT=edge-worker \
  NX_TASK_TARGET_TARGET=build
sleep 0.3
pid=$(cat "$tmp/nontarget.pid")
check "non-lifecycle target does not match" 1 \
  "$scripts/test-env-fresh.sh" --is-owned-test-process "$pid"
stop_test_proc "$tmp/nontarget.pid"

start_test_proc "$tmp/foreign.pid" \
  "NX_WORKSPACE_ROOT=$tmp" \
  NX_TASK_TARGET_PROJECT=edge-worker \
  NX_TASK_TARGET_TARGET=test:integration
sleep 0.3
pid=$(cat "$tmp/foreign.pid")
check "foreign workspace root does not match" 1 \
  "$scripts/test-env-fresh.sh" --is-owned-test-process "$pid"
stop_test_proc "$tmp/foreign.pid"

"$scripts/supabase-start.sh" --self-test || failures=$((failures + 1))
"$scripts/functions-server.sh" --self-test || failures=$((failures + 1))
"$scripts/ensure-migrations.sh" --self-test || failures=$((failures + 1))
"$root/pkgs/edge-worker/scripts/ensure-db-core" --self-test || failures=$((failures + 1))

if [[ "$failures" -eq 0 ]]; then
  echo "All lifecycle regression checks passed."
else
  echo "$failures lifecycle regression check(s) failed." >&2
  exit 1
fi
