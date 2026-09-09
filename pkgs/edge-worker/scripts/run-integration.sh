#!/usr/bin/env bash
# Runs edge-worker integration tests together with their database setup under
# one exclusive integration resource lock, so migration preparation, live
# setup, and the whole suite form a single critical section across full,
# focused, and standalone ensure paths.
#
# Invoked through scripts/with-integration-lock.sh (which holds the locks for
# this command's whole lifetime):
#   with-integration-lock.sh ./scripts/run-integration.sh [file]
# An optional file argument is validated (scripts/require-test-file.sh)
# before any setup runs.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [tests/integration/<file>.test.ts]" >&2
  exit 2
fi
if [[ $# -eq 1 ]]; then
  ../../scripts/require-test-file.sh tests/integration "$1"
fi

./scripts/ensure-db-core
exec deno test --config deno.test.json --allow-all --env=supabase/functions/.env "${1:-tests/integration}"
