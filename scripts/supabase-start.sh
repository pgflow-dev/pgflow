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

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if all required services are running for a specific project
# This is more reliable than `supabase status` which returns 0 even with stopped services
# Args: $1 = project_name (e.g., "cli", "edge-worker")
# Uses REQUIRED_SERVICES array (service names like: db, rest, realtime)
# Container names follow pattern: supabase_{service}_{project_name}
check_required_services_running() {
  local project_name="$1"
  local running_containers
  running_containers=$(docker ps --format '{{.Names}}' 2>/dev/null)

  for service in "${REQUIRED_SERVICES[@]}"; do
    local container_name="supabase_${service}_${project_name}"
    if ! echo "$running_containers" | grep -qF "$container_name"; then
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

# Convert to absolute path for consistent file lookups after cd
PROJECT_DIR=$(realpath "$PROJECT_DIR")

# Change to project directory (Supabase CLI uses current directory)
cd "$PROJECT_DIR"

# ============================================================================
# TODO: Future improvement - consolidate project_id and services detection
# ============================================================================
# Currently we read project_name from project.json and services from config.toml
# separately. This could be simplified by having get-enabled-services.mjs return
# JSON with both values:
#
#   {"project_id":"core","services":["db","realtime"]}
#
# Then parse with jq:
#   CONFIG_JSON=$(node "$SCRIPT_DIR/get-enabled-services.mjs" "$CONFIG_TOML")
#   PROJECT_NAME=$(echo "$CONFIG_JSON" | jq -r '.project_id')
#   mapfile -t REQUIRED_SERVICES < <(echo "$CONFIG_JSON" | jq -r '.services[]')
#
# Benefits:
#   - Single source of truth (config.toml has project_id)
#   - Removes project.json dependency for this script
#   - More extensible JSON output
# ============================================================================

# Extract project name from project.json (matches project_id in supabase/config.toml)
if [ ! -f "$PROJECT_DIR/project.json" ]; then
  echo -e "${RED}Error: project.json not found in $PROJECT_DIR${NC}" >&2
  exit 1
fi

PROJECT_NAME=$(jq -r '.name' "$PROJECT_DIR/project.json")
if [ -z "$PROJECT_NAME" ] || [ "$PROJECT_NAME" = "null" ]; then
  echo -e "${RED}Error: Could not read 'name' from project.json${NC}" >&2
  exit 1
fi

# Get enabled services from config.toml dynamically
# This reads the actual config and outputs service names for enabled services
CONFIG_TOML="$PROJECT_DIR/supabase/config.toml"
if [ ! -f "$CONFIG_TOML" ]; then
  echo -e "${RED}Error: config.toml not found at $CONFIG_TOML${NC}" >&2
  exit 1
fi

# Read enabled service names into array using Node script
# Service names are like: db, rest, realtime, edge_runtime
mapfile -t REQUIRED_SERVICES < <(node "$SCRIPT_DIR/get-enabled-services.mjs" "$CONFIG_TOML")

if [ ${#REQUIRED_SERVICES[@]} -eq 0 ]; then
  echo -e "${RED}Error: Could not determine required services from config.toml${NC}" >&2
  exit 1
fi

echo -e "${YELLOW}Checking Supabase status for project '$PROJECT_NAME' in: $PROJECT_DIR${NC}"
echo -e "${YELLOW}Required services: ${REQUIRED_SERVICES[*]}${NC}"

# Fast path: Check if all required Supabase services are running via docker ps
# This is more reliable than `supabase status` which returns 0 even with stopped services
if check_required_services_running "$PROJECT_NAME"; then
  echo -e "${GREEN}✓ Supabase is already running for project '$PROJECT_NAME' (all required services up)${NC}"
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
