#!/usr/bin/env bash
# Lock-assuming Supabase stack start body. Public callers use
# scripts/supabase-start-locked.sh or scripts/with-supabase-lock.sh.
set -euo pipefail

required_services_running() {
  local service names
  names=$(docker ps --format '{{.Names}}' 2>/dev/null || true)
  for service in "${required_services[@]}"; do
    grep -qx "supabase_${service}_${project_id}" <<<"$names" || return 1
  done
}

required_services_ready() {
  local service health
  required_services_running || return 1
  for service in "${required_services[@]}"; do
    health=$(docker inspect "supabase_${service}_${project_id}" \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
      2>/dev/null) || return 1
    [[ "$health" == healthy || "$health" == none ]] || return 1
  done
}

wait_for_required_services() {
  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    required_services_ready && return 0
    sleep 0.5
  done
  echo "Supabase services for '$project_id' did not become ready within 60s." >&2
  return 1
}

run_supabase_start() {
  local restart=false project_dir config script_dir prepare_script attempt
  if [[ "${1:-}" == "--restart" ]]; then
    restart=true
    shift
  fi
  [[ $# -eq 1 && -d "$1" ]] || {
    echo "Usage: $0 [--restart] <project-directory>" >&2
    return 2
  }

  project_dir=$(realpath "$1")
  config="$project_dir/supabase/config.toml"
  [[ -f "$config" ]] || {
    echo "Supabase config not found: $config" >&2
    return 1
  }
  project_id=$(sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$config" | head -1)
  [[ -n "$project_id" ]] || {
    echo "Could not read project_id from $config." >&2
    return 1
  }

  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  cd "$project_dir"
  prepare_script="$project_dir/scripts/prepare-supabase.sh"

  # Copy the current core-derived edge migrations before the running-stack
  # fast path. The following ensure fingerprint cannot see an old mirror.
  if [[ -x "$prepare_script" ]]; then
    echo "Preparing Supabase for '$project_id'..."
    "$prepare_script"
  fi

  mapfile -t required_services < <(node "$script_dir/get-enabled-services.mjs" "$config")
  ((${#required_services[@]})) || {
    echo "Could not determine required services from $config." >&2
    return 1
  }

  if [[ "$restart" == true ]]; then
    echo "Restarting Supabase stack '$project_id' from the current configuration..."
    pnpm exec supabase stop --no-backup
  fi

  if required_services_running; then
    wait_for_required_services
    echo "Supabase is already running for '$project_id'."
    return 0
  fi

  echo "Starting Supabase stack '$project_id'..."
  pnpm exec supabase stop --no-backup >/dev/null 2>&1 || true
  sleep 2
  for attempt in 1 2 3; do
    if pnpm exec supabase start; then
      wait_for_required_services
      echo "Supabase started for '$project_id'."
      return 0
    fi
    if [[ "$attempt" != 3 ]]; then
      echo "Supabase start failed; retrying in 5s..." >&2
      pnpm exec supabase stop --no-backup >/dev/null 2>&1 || true
      sleep 5
    fi
  done

  echo "Failed to start Supabase stack '$project_id'." >&2
  return 1
}

supabase_start_self_test() {
  local root edge core failures=0
  root=$(mktemp -d)
  edge="$root/edge-worker"
  core="$root/core"
  mkdir -p "$edge/supabase/migrations" "$edge/scripts" "$core/migrations"
  printf 'project_id = "edge-selftest"\n' >"$edge/supabase/config.toml"
  cat >"$edge/scripts/prepare-supabase.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
pkg=$(cd "$(dirname "$0")/.." && pwd)
cp "$pkg/../core/migrations/current.sql" "$pkg/supabase/migrations/current.sql"
EOF
  chmod +x "$edge/scripts/prepare-supabase.sh"

  printf '99\n' >"$root/health-probe-count"
  node() { printf 'db\nauth\n'; }
  docker() {
    local health_probe_count
    case "$1" in
      ps) printf 'supabase_db_edge-selftest\nsupabase_auth_edge-selftest\n' ;;
      inspect)
        health_probe_count=$(<"$root/health-probe-count")
        health_probe_count=$((health_probe_count + 1))
        printf '%s\n' "$health_probe_count" >"$root/health-probe-count"
        if ((health_probe_count == 1)); then printf 'starting\n'; else printf 'healthy\n'; fi
        ;;
    esac
  }
  pnpm() {
    echo "FAIL fast path unexpectedly ran pnpm $*" >&2
    return 1
  }

  printf 'A\n' >"$core/migrations/current.sql"
  run_supabase_start "$edge" >/dev/null
  if [[ "$(<"$edge/supabase/migrations/current.sql")" == A ]]; then
    echo "ok   fast path prepares the initial migration mirror"
  else
    echo "FAIL fast path did not prepare the initial migration mirror"
    failures=$((failures + 1))
  fi

  printf 'B\n' >"$core/migrations/current.sql"
  run_supabase_start "$edge" >/dev/null
  if [[ "$(<"$edge/supabase/migrations/current.sql")" == B ]]; then
    echo "ok   running-stack fast path refreshes A-to-B migration content"
  else
    echo "FAIL running-stack fast path retained stale A migration content"
    failures=$((failures + 1))
  fi

  printf '0\n' >"$root/health-probe-count"
  run_supabase_start "$edge" >/dev/null
  if (( $(<"$root/health-probe-count") >= 3 )); then
    echo "ok   fast path waits for required service health"
  else
    echo "FAIL fast path skipped required service health"
    failures=$((failures + 1))
  fi

  rm -rf "$root"
  if [[ "$failures" -eq 0 ]]; then
    echo "supabase-start self-test passed."
    return 0
  fi
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ "${1:-}" == "--self-test" ]]; then
    supabase_start_self_test
  else
    run_supabase_start "$@"
  fi
fi
