#!/usr/bin/env bash
#
# Restore data dump to demo-preview
# Run this from apps/demo directory after downloading dump
#

set -euo pipefail

cd "$(dirname "$0")/.."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check for required tools
if ! command -v psql &> /dev/null; then
  log_error "psql not found. Please install PostgreSQL client tools."
  exit 1
fi

# Check for dump file
if [ $# -eq 0 ]; then
  log_error "Usage: $0 <dump-file.sql>"
  log_info "Available dumps in dumps/:"
  ls -lh dumps/*.sql 2>/dev/null || log_info "  (none)"
  exit 1
fi

DUMP_FILE="$1"

if [ ! -f "$DUMP_FILE" ]; then
  log_error "Dump file not found: $DUMP_FILE"
  exit 1
fi

# Verify env file exists
if [ ! -f .env.preview ]; then
  log_error ".env.preview not found"
  exit 1
fi

log_info "Sourcing .env.preview..."
set -a; source .env.preview; set +a

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  log_error "SUPABASE_DB_URL not set in .env.preview"
  exit 1
fi

log_warn "This will REPLACE ALL pgflow schema data in preview"
log_warn "Preview DB: $SUPABASE_DB_URL"
read -p "Continue? (yes/no): " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
  log_info "Aborted"
  exit 0
fi

log_info "Step 1: Truncating pgflow schema data..."

psql "$SUPABASE_DB_URL" <<'EOSQL'
SET session_replication_role = 'replica';

-- Truncate all pgflow tables (order matters due to FKs, CASCADE handles it)
TRUNCATE TABLE pgflow.step_tasks CASCADE;
TRUNCATE TABLE pgflow.step_states CASCADE;
TRUNCATE TABLE pgflow.runs CASCADE;
TRUNCATE TABLE pgflow.workers CASCADE;
TRUNCATE TABLE pgflow.worker_functions CASCADE;
TRUNCATE TABLE pgflow.deps CASCADE;
TRUNCATE TABLE pgflow.steps CASCADE;
TRUNCATE TABLE pgflow.flows CASCADE;

SET session_replication_role = 'origin';
EOSQL

log_info "Step 2: Loading dump..."

psql "$SUPABASE_DB_URL" < "$DUMP_FILE"

log_info "Restore completed successfully!"
log_info "Preview database now has production pgflow data"
