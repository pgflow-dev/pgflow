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

# Fast path: Check if Supabase is already running
# This makes repeated calls very fast
if pnpm exec supabase status > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Supabase is already running${NC}"
  exit 0
fi

# Supabase is not running - need to start it
echo -e "${YELLOW}Supabase is not running. Starting...${NC}"

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
