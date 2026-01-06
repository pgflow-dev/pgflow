#!/usr/bin/env bash
#
# Download data dump from demo-production
# Run this from apps/demo directory
#

set -euo pipefail

cd "$(dirname "$0")/.."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check for required tools
if ! command -v pg_dump &> /dev/null; then
  log_error "pg_dump not found. Please install PostgreSQL client tools."
  exit 1
fi

# Verify env file exists
if [ ! -f .env.production ]; then
  log_error ".env.production not found"
  exit 1
fi

# Create output directory
mkdir -p dumps
DUMP_FILE="dumps/production-data-$(date +%Y%m%d-%H%M%S).sql"

log_info "Sourcing .env.production..."
set -a; source .env.production; set +a

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  log_error "SUPABASE_DB_URL not set in .env.production"
  exit 1
fi

log_info "Dumping pgflow schema data from production to $DUMP_FILE"

pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --schema=pgflow \
  --no-owner \
  --no-privileges \
  > "$DUMP_FILE"

log_info "Dump completed successfully!"
log_info "File: $DUMP_FILE"
ls -lh "$DUMP_FILE"
