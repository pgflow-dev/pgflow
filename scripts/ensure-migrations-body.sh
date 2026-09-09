#!/usr/bin/env bash
# Lock-assuming migration materialization body. Call it only through
# scripts/with-supabase-lock.sh; the public ensure-migrations.sh entry point
# acquires that lock before it reaches this file.
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/ensure-migrations.sh
source "$script_dir/ensure-migrations.sh"

run_ensure_migrations_body "$@"
