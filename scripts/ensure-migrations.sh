#!/usr/bin/env bash
# Public entry point for migration materialization. It acquires the stack lock
# and runs the lock-assuming body in ensure-migrations-body.sh.
set -euo pipefail

SCRIPTS_DIR=${SCRIPTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}
# shellcheck source=scripts/supabase-start.sh
source "$SCRIPTS_DIR/supabase-start.sh"

declare -a required_services=()
REALTIME_ROUTE_API_URL=
REALTIME_ROUTE_ANON_KEY=

compute_database_fingerprint() {
  {
    printf '%s\n' '-- migrations'
    while IFS= read -r migration; do
      printf '%s\n' "-- $migration"
      cat "$migration"
    done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | LC_ALL=C sort)
    if [[ -f supabase/seed.sql ]]; then
      printf '%s\n' '-- supabase/seed.sql'
      cat supabase/seed.sql
    fi
  } | sha256sum | cut -d' ' -f1
}

compute_stack_fingerprint() {
  local root setup
  root=$(git -C "$PROJECT_DIR" rev-parse --show-toplevel)
  {
    printf '%s\n' '-- supabase/config.toml'
    cat supabase/config.toml
    for setup in \
      "$SCRIPTS_DIR/supabase-start.sh" \
      "$SCRIPTS_DIR/get-enabled-services.mjs" \
      "$SCRIPTS_DIR/ensure-migrations.sh" \
      "$SCRIPTS_DIR/ensure-migrations-body.sh"; do
      printf '%s\n' "-- $setup"
      cat "$setup"
    done
    if [[ -f scripts/prepare-supabase.sh ]]; then
      printf '%s\n' '-- scripts/prepare-supabase.sh'
      cat scripts/prepare-supabase.sh
    fi
    printf '%s\n' '-- pnpm-lock.yaml'
    cat "$root/pnpm-lock.yaml"
    printf '%s\n' '-- supabase-cli-version'
    pnpm exec supabase --version
  } | sha256sum | cut -d' ' -f1
}

read_applied_fingerprint() { # read_applied_fingerprint <key>
  local key=$1 attempt
  for attempt in 1 2 3; do
    docker exec "$container" psql -U postgres -d postgres -tA -c \
      "SELECT value FROM public.pgflow_setup_fingerprint WHERE key = '$key'" \
      2>/dev/null && return 0
    [[ "$attempt" == 3 ]] || sleep 2
  done
  return 1
}

invalidate_applied_fingerprints() {
  docker exec "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c \
    'DROP TABLE IF EXISTS public.pgflow_setup_fingerprint'
}

write_applied_fingerprints() {
  docker exec "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "
    CREATE TABLE public.pgflow_setup_fingerprint (
      key text PRIMARY KEY,
      value text NOT NULL
    );
    INSERT INTO public.pgflow_setup_fingerprint (key, value)
    VALUES
      ('database-content', '$expected_database'),
      ('stack-setup', '$expected_stack')
    ON CONFLICT (key) DO UPDATE SET value = excluded.value;
  "
}

reset_database() {
  pnpm exec supabase db reset
}

has_required_service() { # has_required_service <service>
  local expected=$1 service
  for service in "${required_services[@]}"; do
    [[ "$service" == "$expected" ]] && return 0
  done
  return 1
}

read_supabase_status_value() { # read_supabase_status_value <name> <status-output>
  local name=$1 status=$2
  sed -nE "s/^${name}=\"?([^\"[:space:]]+)\"?$/\1/p" <<<"$status" | head -1
}

load_realtime_route_config() {
  local status
  status=$(timeout 10 pnpm exec supabase status -o env 2>/dev/null) || {
    echo "Could not read the configured Supabase API route for '$project_id'." >&2
    return 1
  }
  REALTIME_ROUTE_API_URL=$(read_supabase_status_value API_URL "$status")
  REALTIME_ROUTE_ANON_KEY=$(read_supabase_status_value ANON_KEY "$status")
  [[ -n "$REALTIME_ROUTE_API_URL" ]] || {
    echo "Could not read the configured Supabase Realtime route for '$project_id'." >&2
    return 1
  }
}

probe_realtime_kong_route() {
  PGFLOW_REALTIME_API_URL="$REALTIME_ROUTE_API_URL" \
    PGFLOW_REALTIME_ANON_KEY="$REALTIME_ROUTE_ANON_KEY" /usr/bin/python3 - <<'PY'
import os
import socket
import sys
from urllib.parse import urlencode, urlparse

api = urlparse(os.environ["PGFLOW_REALTIME_API_URL"])
key = os.environ["PGFLOW_REALTIME_ANON_KEY"]
if api.scheme != "http" or not api.hostname:
    sys.exit(1)
port = api.port or 80
host = api.hostname if port == 80 else f"{api.hostname}:{port}"
if key:
    path = f"{api.path.rstrip('/')}/realtime/v1/websocket?{urlencode({'apikey': key, 'vsn': '1.0.0'})}"
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}\r\n"
        "Connection: Upgrade\r\n"
        "Upgrade: websocket\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
    ).encode()
    expected_status = b"101"
else:
    # Auth-disabled stacks have no local API key. This hits Kong's configured
    # Realtime HTTP route to the same realtime:4000 upstream.
    path = f"{api.path.rstrip('/')}/realtime/v1/api/ping"
    request = f"GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n".encode()
    expected_status = b"200"
try:
    with socket.create_connection((api.hostname, port), timeout=2) as sock:
        sock.settimeout(2)
        sock.sendall(request)
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk
except OSError:
    sys.exit(1)
status = response.split(b"\r\n", 1)[0].split()
sys.exit(0 if len(status) >= 2 and status[1] == expected_status else 1)
PY
}

wait_for_realtime_kong_route() {
  local deadline=$((SECONDS + 60))
  load_realtime_route_config || return 1
  until probe_realtime_kong_route; do
    if ((SECONDS >= deadline)); then
      echo "Supabase Realtime route for '$project_id' did not become ready within 60s." >&2
      return 1
    fi
    sleep 0.5
  done
}

wait_for_post_reset_services() {
  wait_for_required_services || return 1
  if has_required_service realtime && has_required_service kong; then
    wait_for_realtime_kong_route
  fi
}

restart_stack() {
  "$SCRIPTS_DIR/supabase-start.sh" --restart "$PROJECT_DIR"
}

ensure_migrations() {
  local applied_database applied_stack invalidated=false
  applied_database=$(read_applied_fingerprint database-content || true)
  applied_stack=$(read_applied_fingerprint stack-setup || true)

  if [[ "$applied_stack" != "$expected_stack" ]]; then
    echo "Stack setup for '$project_id' changed; restarting from the current configuration..."
    # Remove success evidence before the restart. A failed A -> B -> A setup
    # cannot later reuse an old certificate.
    invalidate_applied_fingerprints
    invalidated=true
    restart_stack
    applied_database=
    applied_stack=
  fi

  if [[ "$FORCE_RESET" != true \
    && "$applied_database" == "$expected_database" \
    && "$applied_stack" == "$expected_stack" ]]; then
    echo "Database migrations for '$project_id' are current (fingerprint match)."
    return 0
  fi

  if [[ "$invalidated" != true ]]; then
    invalidate_applied_fingerprints
  fi
  if [[ "$FORCE_RESET" == true ]]; then
    echo "Forcing a reset of the '$project_id' database..."
  elif [[ -n "$applied_database" ]]; then
    echo "Database content for '$project_id' changed; resetting..."
  else
    echo "No applied database fingerprint found for '$project_id'; resetting..."
  fi

  reset_database || {
    echo "Resetting the '$project_id' database failed; no fingerprint was written." >&2
    return 1
  }
  wait_for_post_reset_services || {
    echo "Supabase services for '$project_id' did not become ready after database reset; no fingerprint was written." >&2
    return 1
  }
  write_applied_fingerprints || {
    echo "Writing applied fingerprints for '$project_id' failed." >&2
    return 1
  }
  echo "Database migrations for '$project_id' applied and fingerprinted."
}

parse_arguments() {
  FORCE_RESET=false
  PROJECT_DIR=
  while (($#)); do
    case "$1" in
      --force-reset) FORCE_RESET=true ;;
      -*) echo "Unknown option: $1" >&2; return 2 ;;
      *)
        [[ -z "$PROJECT_DIR" ]] || {
          echo "Usage: $0 [--force-reset] <project-dir>" >&2
          return 2
        }
        PROJECT_DIR=$1
        ;;
    esac
    shift
  done
  [[ -n "$PROJECT_DIR" && -d "$PROJECT_DIR" ]] || {
    echo "Usage: $0 [--force-reset] <project-dir>" >&2
    return 2
  }
  PROJECT_DIR=$(realpath "$PROJECT_DIR")
}

run_ensure_migrations_body() {
  SCRIPTS_DIR=${SCRIPTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}
  parse_arguments "$@"

  cd "$PROJECT_DIR"
  project_id=$(sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' supabase/config.toml | head -1)
  [[ -n "$project_id" ]] || {
    echo "Could not read project_id from $PROJECT_DIR/supabase/config.toml." >&2
    return 1
  }
  container="supabase_db_${project_id}"
  mapfile -t required_services < <(node "$SCRIPTS_DIR/get-enabled-services.mjs" supabase/config.toml)
  ((${#required_services[@]})) || {
    echo "Could not determine required services from $PROJECT_DIR/supabase/config.toml." >&2
    return 1
  }

  # This runs edge-worker migration preparation before the running-stack fast
  # path and before either fingerprint reads the generated mirror.
  "$SCRIPTS_DIR/supabase-start.sh" "$PROJECT_DIR"
  expected_database=$(compute_database_fingerprint)
  expected_stack=$(compute_stack_fingerprint)
  [[ "$expected_database" =~ ^[0-9a-f]{64}$ && "$expected_stack" =~ ^[0-9a-f]{64}$ ]] || {
    echo "Could not compute the database or stack fingerprint." >&2
    return 1
  }

  ensure_migrations
}

project_dir_from_arguments() {
  local argument project_dir=
  for argument in "$@"; do
    [[ "$argument" == --force-reset ]] && continue
    [[ "$argument" != -* ]] || return 1
    [[ -z "$project_dir" ]] || return 1
    project_dir=$argument
  done
  [[ -n "$project_dir" && -d "$project_dir" ]] || return 1
  realpath "$project_dir"
}

run_ensure_migrations() {
  local project_dir
  project_dir=$(project_dir_from_arguments "$@") || {
    echo "Usage: $0 [--force-reset] <project-dir>" >&2
    exit 2
  }
  SCRIPTS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  exec "$SCRIPTS_DIR/with-supabase-lock.sh" "$project_dir" \
    "$SCRIPTS_DIR/ensure-migrations-body.sh" "$@"
}

self_test() {
  local root status reset_line restart_line health_line route_line write_line failures=0
  root=$(mktemp -d)
  SCRIPTS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  PROJECT_DIR=$root
  project_id=selftest
  container=supabase_db_selftest
  expected_database=database-a
  expected_stack=stack-a
  FORCE_RESET=false

  docker() {
    echo "docker $*" >>"$root/calls"
    case "$*" in
      *"WHERE key = 'database-content'"*) [[ -f "$root/database" ]] && cat "$root/database" || return 1 ;;
      *"WHERE key = 'stack-setup'"*) [[ -f "$root/stack" ]] && cat "$root/stack" || return 1 ;;
      *"DROP TABLE IF EXISTS"*) rm -f "$root/database" "$root/stack" ;;
      *"ON CONFLICT"*)
        [[ -f "$root/write-fails" ]] && return 1
        printf '%s\n' "$expected_database" >"$root/database"
        printf '%s\n' "$expected_stack" >"$root/stack"
        ;;
    esac
  }
  pnpm() {
    echo "pnpm $*" >>"$root/calls"
    [[ -f "$root/reset-fails" ]] && return 1
    return 0
  }
  restart_stack() {
    echo restart_stack >>"$root/calls"
    [[ -f "$root/restart-fails" ]] && return 1
    return 0
  }
  required_services=(db realtime kong)
  wait_for_required_services() {
    echo wait_for_required_services >>"$root/calls"
    [[ ! -f "$root/health-fails" ]]
  }
  wait_for_realtime_kong_route() {
    echo wait_for_realtime_kong_route >>"$root/calls"
    [[ ! -f "$root/route-fails" ]]
  }

  expect_status() {
    local name=$1 want=$2
    shift 2
    : >"$root/calls"
    if "$@" >/dev/null 2>&1; then status=0; else status=$?; fi
    if [[ "$status" == "$want" ]]; then
      echo "ok   $name"
    else
      echo "FAIL $name (expected exit $want, got $status)"
      failures=$((failures + 1))
    fi
  }
  calls_match() {
    if grep -qE "$2" "$root/calls"; then
      echo "ok   $1"
    else
      echo "FAIL $1 (wanted /$2/ in: $(paste -sd';' <"$root/calls"))"
      failures=$((failures + 1))
    fi
  }
  calls_absent() {
    if grep -qE "$2" "$root/calls"; then
      echo "FAIL $1 (unwanted /$2/ in: $(paste -sd';' <"$root/calls"))"
      failures=$((failures + 1))
    else
      echo "ok   $1"
    fi
  }

  printf '%s\n' "$expected_database" >"$root/database"
  printf '%s\n' "$expected_stack" >"$root/stack"
  expect_status "reuse on complete identity match" 0 ensure_migrations
  calls_match "reuse reads database identity" "database-content"
  calls_match "reuse reads stack identity" "stack-setup"
  calls_absent "reuse does not reset" "^pnpm exec supabase db reset$"
  calls_absent "reuse does not restart" "^restart_stack$"

  expected_stack=stack-b
  expect_status "stack mismatch restarts then resets" 0 ensure_migrations
  calls_match "stack mismatch invalidates old evidence" "DROP TABLE IF EXISTS"
  calls_match "stack mismatch restarts" "^restart_stack$"
  calls_match "stack mismatch resets content" "^pnpm exec supabase db reset$"
  reset_line=$(grep -nE '^pnpm exec supabase db reset$' "$root/calls" | head -1 | cut -d: -f1)
  restart_line=$(grep -nE '^restart_stack$' "$root/calls" | head -1 | cut -d: -f1)
  health_line=$(grep -nE '^wait_for_required_services$' "$root/calls" | head -1 | cut -d: -f1)
  route_line=$(grep -nE '^wait_for_realtime_kong_route$' "$root/calls" | head -1 | cut -d: -f1)
  write_line=$(grep -nE 'ON CONFLICT' "$root/calls" | head -1 | cut -d: -f1)
  if [[ -n "$restart_line" && -n "$reset_line" && -n "$health_line" && -n "$route_line" && -n "$write_line" \
    && "$restart_line" -lt "$reset_line" && "$reset_line" -lt "$health_line" \
    && "$health_line" -lt "$route_line" && "$route_line" -lt "$write_line" ]]; then
    echo "ok   restart, reset, health, route, then success write"
  else
    echo "FAIL restart, reset, health, route, then success write"
    failures=$((failures + 1))
  fi

  expected_database=database-b
  expect_status "database mismatch resets" 0 ensure_migrations
  calls_match "database mismatch invalidates old evidence" "DROP TABLE IF EXISTS"
  calls_match "database mismatch resets" "^pnpm exec supabase db reset$"

  expected_database=database-a
  expect_status "A-to-B-to-A content change resets again" 0 ensure_migrations
  calls_match "return to A resets instead of trusting stale evidence" "^pnpm exec supabase db reset$"

  expected_database=database-c
  touch "$root/route-fails"
  expect_status "post-reset Realtime route failure propagates" 1 ensure_migrations
  calls_match "route failure follows reset" "^pnpm exec supabase db reset$"
  calls_match "route failure waits for service health" "^wait_for_required_services$"
  calls_match "route failure probes the configured Realtime route" "^wait_for_realtime_kong_route$"
  calls_absent "route failure does not write a fingerprint" "ON CONFLICT"
  [[ ! -e "$root/database" && ! -e "$root/stack" ]] && echo "ok   failed route barrier leaves no success evidence" || {
    echo "FAIL failed route barrier leaves no success evidence"
    failures=$((failures + 1))
  }
  rm -f "$root/route-fails"

  expected_database=database-d
  touch "$root/reset-fails"
  expect_status "reset failure propagates" 1 ensure_migrations
  calls_absent "reset failure does not write a fingerprint" "ON CONFLICT"
  calls_absent "reset failure does not wait for services" "wait_for_required_services"
  [[ ! -e "$root/database" && ! -e "$root/stack" ]] && echo "ok   failed reset leaves no success evidence" || {
    echo "FAIL failed reset leaves no success evidence"
    failures=$((failures + 1))
  }
  rm -f "$root/reset-fails"

  expected_database=database-e
  touch "$root/write-fails"
  expect_status "fingerprint write failure propagates" 1 ensure_migrations
  rm -f "$root/write-fails"

  rm -rf "$root"
  if [[ "$failures" -eq 0 ]]; then
    echo "ensure-migrations self-test passed."
    return 0
  fi
  echo "$failures ensure-migrations self-test check(s) failed." >&2
  return 1
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
elif [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  run_ensure_migrations "$@"
fi
