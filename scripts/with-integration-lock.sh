#!/usr/bin/env bash
# Runs a command while holding the exclusive pgflow integration resource
# lock, spanning migration preparation, live database setup, and the whole
# integration suite (the caller's command). Locks are released only when the
# command (and its children, which inherit the lock file descriptors) exit.
#
# Lock order, shared with scripts/test-env-fresh.sh and
# scripts/supabase-start-locked.sh - keep it stable:
#   1. environment lock, shared (excludes test-env:fresh teardown)
#   2. integration resource lock, exclusive
# test-env:fresh takes the environment lock exclusively FIRST and then tries
# the resource lock with a bounded wait, so neither side can wait forever.
set -euo pipefail

[[ $# -gt 0 ]] || { echo "Usage: $0 <command> [args...]" >&2; exit 2; }

LOCK_DIR=$(cd "$(dirname "$0")" && ./lock-dir.sh)

exec 9>"$LOCK_DIR/environment.lock"
flock --shared 9
exec 8>"$LOCK_DIR/integration-db.lock"
flock 8

exec "$@"
