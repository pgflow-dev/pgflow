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
#   3. If not running: cleans up stale containers and starts fresh
#   4. Waits for containers to actually stop (fixes Supabase CLI bug)
#   5. Verifies ports are free before starting
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

# ============================================================================
# Helper Functions
# ============================================================================

# Extract project_id from config.toml
get_project_id() {
  local config_file="$1/supabase/config.toml"
  if [ ! -f "$config_file" ]; then
    echo -e "${RED}Error: config.toml not found at $config_file${NC}" >&2
    return 1
  fi
  grep "^project_id" "$config_file" | cut -d'"' -f2
}

# Extract all ports from config.toml
get_project_ports() {
  local config_file="$1/supabase/config.toml"
  # Extract port value between = and any comment (#), trim spaces
  grep -E "^\s*port\s*=" "$config_file" | sed 's/.*=\s*\([0-9]*\).*/\1/' | sort -u
}

# Check if any Supabase containers are running for this project
containers_running() {
  local project_id="$1"
  docker ps --filter "name=supabase.*${project_id}" --format "{{.Names}}" 2>/dev/null | grep -q .
}

# Wait for containers to stop with timeout
wait_for_containers_to_stop() {
  local project_id="$1"
  local max_wait="${2:-30}"  # Default 30 seconds

  echo -e "${YELLOW}Waiting for containers to fully stop...${NC}"
  local waited=0

  while [ $waited -lt $max_wait ]; do
    local running_containers=$(docker ps --filter "name=supabase.*${project_id}" --format "{{.Names}}" 2>/dev/null)
    if [ -z "$running_containers" ]; then
      echo -e "${GREEN}✓ All containers stopped${NC}"
      return 0
    fi

    sleep 1
    waited=$((waited + 1))

    # Progress indicator every 5 seconds
    if [ $((waited % 5)) -eq 0 ]; then
      echo -e "${YELLOW}Still waiting... (${waited}s)${NC}"
    fi
  done

  # Timeout reached
  echo -e "${YELLOW}Containers didn't stop gracefully after ${max_wait}s${NC}"
  return 1
}

# Force kill containers and clean up
force_cleanup_containers() {
  local project_id="$1"

  echo -e "${YELLOW}Forcing container removal for project: ${project_id}${NC}"

  # Kill running containers
  docker ps --filter "name=supabase.*${project_id}" -q | xargs -r docker kill 2>/dev/null || true

  # Remove stopped containers
  docker ps -a --filter "name=supabase.*${project_id}" -q | xargs -r docker rm 2>/dev/null || true
}

# Clean up any processes holding our ports
cleanup_port_processes() {
  local project_dir="$1"
  local ports=$(get_project_ports "$project_dir")

  for port in $ports; do
    # Check if port is in use
    if nc -z localhost "$port" 2>/dev/null; then
      # Find process holding the port using ss
      local pid=$(ss -lpn 2>/dev/null | grep ":$port " | grep -oE "pid=[0-9]+" | cut -d= -f2 | head -1)
      if [ -n "$pid" ]; then
        echo -e "${YELLOW}Killing process holding port $port (PID: $pid)${NC}"
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
  done

  # Give OS time to release ports
  sleep 2
}

# Verify all required ports are free
verify_ports_free() {
  local project_dir="$1"
  local ports=$(get_project_ports "$project_dir")
  local all_free=true

  for port in $ports; do
    if nc -z localhost "$port" 2>/dev/null; then
      echo -e "${RED}Error: Port $port is still in use${NC}" >&2
      all_free=false
    fi
  done

  if [ "$all_free" = true ]; then
    echo -e "${GREEN}✓ All required ports are free${NC}"
    return 0
  else
    return 1
  fi
}

# ============================================================================
# Main Script
# ============================================================================

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

# Get project ID from config
PROJECT_ID=$(get_project_id ".")
if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}Error: Could not extract project_id from config.toml${NC}" >&2
  exit 1
fi

echo -e "${YELLOW}Checking Supabase status for project: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Start time: $(date '+%H:%M:%S')${NC}"

# Fast path: Check if Supabase is already running
# This makes repeated calls very fast
if pnpm exec supabase status > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Supabase is already running${NC}"
  exit 0
fi

# Supabase is not running - need to start it
echo -e "${YELLOW}Supabase is not running. Starting...${NC}"

# Clean up any stale containers first
echo -e "${YELLOW}Cleaning up any stale containers...${NC}"
pnpm exec supabase stop --no-backup 2>/dev/null || true

# Wait for containers to actually stop
if ! wait_for_containers_to_stop "$PROJECT_ID" 30; then
  # Force cleanup if graceful stop failed
  force_cleanup_containers "$PROJECT_ID"

  # Extra wait after force cleanup
  sleep 2
fi

# Clean up any lingering port processes
cleanup_port_processes "."

# Final verification that ports are free
if ! verify_ports_free "."; then
  echo -e "${RED}Error: Unable to free all required ports${NC}" >&2
  echo -e "${YELLOW}You may need to manually check what's using these ports${NC}" >&2
  exit 1
fi

# Start Supabase with all configured services
echo -e "${YELLOW}Starting Supabase... (this may take 1-2 minutes in CI)${NC}"
echo -e "${YELLOW}Time: $(date '+%H:%M:%S')${NC}"
if pnpm exec supabase start; then
  # Verify Supabase is actually ready with retries
  echo -e "${YELLOW}Verifying Supabase is ready...${NC}"
  MAX_HEALTH_CHECKS=30

  for i in $(seq 1 $MAX_HEALTH_CHECKS); do
    if pnpm exec supabase status > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Supabase started successfully and is ready${NC}"
      echo -e "${YELLOW}End time: $(date '+%H:%M:%S')${NC}"
      exit 0
    fi

    if [ $i -eq $MAX_HEALTH_CHECKS ]; then
      echo -e "${RED}✗ Supabase started but not responding to status check after ${MAX_HEALTH_CHECKS}s${NC}" >&2
      exit 1
    fi

    # Show progress every 5 checks
    if [ $((i % 5)) -eq 0 ]; then
      echo -e "${YELLOW}Waiting for Supabase to be ready... (${i}s)${NC}"
    fi

    sleep 1
  done
else
  echo -e "${RED}✗ Failed to start Supabase${NC}" >&2
  exit 1
fi