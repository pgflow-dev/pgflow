#!/bin/bash
set -e

# ============================================================================
# Supabase Start Worker Script
# ============================================================================
# This script ensures a Supabase instance is running for a given project.
# It is IDEMPOTENT - safe to call multiple times.
#
# This script does NOT handle locking - it assumes the caller (wrapper script)
# has already acquired a lock to prevent concurrent execution.
#
# Usage: supabase-start.sh <project-directory>
#
# Behavior:
#   1. Checks if Supabase is already running (fast path)
#   2. If running: exits immediately
#   3. If not running:
#      a. Runs <project>/scripts/prepare-supabase.sh if it exists (e.g., copy migrations)
#      b. Cleans up stale containers
#      c. Starts Supabase fresh
#
# Exit codes:
#   0 - Success (Supabase is running)
#   1 - Failure (could not start Supabase)
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Required services for edge function development
# Note: Services like imgproxy, studio, inbucket, analytics, vector, pg_meta are optional
# Container names use project_id suffix from config.toml (e.g., supabase_db_cli for project_id="cli")
# We use pattern matching to handle different project suffixes
REQUIRED_SERVICES=(
  "supabase_db_"
  "supabase_kong_"
  "supabase_edge_runtime_"
  "supabase_rest_"
  "supabase_realtime_"
)

# Check if all required services are running via docker ps
# This is more reliable than `supabase status` which returns 0 even with stopped services
check_required_services_running() {
  local running_containers
  running_containers=$(docker ps --format '{{.Names}}' 2>/dev/null)

  for service_prefix in "${REQUIRED_SERVICES[@]}"; do
    if ! echo "$running_containers" | grep -q "^${service_prefix}"; then
      return 1
    fi
  done
  return 0
}

# Validate project directory argument
if [ -z "$1" ]; then
  echo -e "${RED}Error: Project directory argument is required${NC}" >&2
  echo "Usage: $0 <project-directory>" >&2
  exit 1
fi

PROJECT_DIR="$1"

# Validate project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "${RED}Error: Project directory not found: $PROJECT_DIR${NC}" >&2
  exit 1
fi

# Change to project directory (Supabase CLI uses current directory)
cd "$PROJECT_DIR"

echo -e "${YELLOW}Checking Supabase status in: $PROJECT_DIR${NC}"

# Fast path: Check if all required Supabase services are running via docker ps
# This is more reliable than `supabase status` which returns 0 even with stopped services
if check_required_services_running; then
  echo -e "${GREEN}✓ Supabase is already running (all required services up)${NC}"
  exit 0
fi

# Some or all required services are not running - need to start/restart
echo -e "${YELLOW}Supabase services not fully running. Starting...${NC}"

# Run package-specific preparation if script exists
PREPARE_SCRIPT="$PROJECT_DIR/scripts/prepare-supabase.sh"
if [ -x "$PREPARE_SCRIPT" ]; then
  echo -e "${YELLOW}Running prepare-supabase.sh...${NC}"
  "$PREPARE_SCRIPT"
fi

# Clean up any stale containers first
# This prevents errors from previous incomplete shutdowns
echo -e "${YELLOW}Cleaning up any stale containers...${NC}"
pnpm exec supabase stop --no-backup 2>/dev/null || true

# Start Supabase with all configured services
echo -e "${YELLOW}Starting Supabase...${NC}"
if pnpm exec supabase start; then
  echo -e "${GREEN}✓ Supabase started successfully${NC}"
  exit 0
else
  echo -e "${RED}✗ Failed to start Supabase${NC}" >&2
  exit 1
fi
