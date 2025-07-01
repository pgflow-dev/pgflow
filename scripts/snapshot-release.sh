#!/bin/bash
set -euo pipefail

# Helper script for creating and publishing snapshot releases
# Safe to use both locally and in CI on branches

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Cleanup function to restore versions on exit
cleanup() {
  if [[ "${CLEANUP_NEEDED:-false}" == true && "$DRY_RUN" != true ]]; then
    echo -e "\n${GREEN}Restoring original versions...${NC}"
    cd "$ROOT_DIR"
    git restore --source=HEAD -- ':/**/package.json' ':/**/jsr.json' pnpm-lock.yaml package-lock.json yarn.lock 2>/dev/null || true
    echo -e "${GREEN}Original versions restored - branch is clean!${NC}"
  fi
}
trap cleanup EXIT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TAG=""
DRY_RUN=false
NO_GIT_TAG="--no-git-tag" # Default to no git tags for snapshots

# Function to print usage
usage() {
  echo "Usage: $0 [snapshot-tag] [options]"
  echo ""
  echo "Options:"
  echo "  --dry-run         Run without actually publishing"
  echo "  --help            Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0                      # Create snapshot with branch name as tag"
  echo "  $0 my-feature           # Create snapshot with 'my-feature' tag"
  echo "  $0 fix-123 --dry-run    # Dry run for 'fix-123' snapshot"
  echo ""
  echo "Note: Packages are published with exact versions (no dist-tags)"
  echo "      Install with: npm install @pgflow/core@0.0.0-TAG-TIMESTAMP"
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      usage
      ;;
    *)
      if [[ -z "$TAG" ]]; then
        TAG="$1"
      fi
      shift
      ;;
  esac
done

# Generate default tag if not provided
if [[ -z "$TAG" ]]; then
  # Use branch name or commit hash as default tag
  BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [[ "$BRANCH_NAME" != "HEAD" && "$BRANCH_NAME" != "" && "$BRANCH_NAME" != "main" ]]; then
    # Clean branch name to be npm-compatible (lowercase, alphanumeric + hyphen)
    TAG=$(echo "$BRANCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  else
    # Fallback to short commit hash
    TAG=$(git rev-parse --short HEAD)
  fi
fi

echo -e "${GREEN}=== pgflow Snapshot Release ===${NC}"
echo -e "${GREEN}Snapshot tag: ${YELLOW}${TAG}${NC}"
echo ""

# Check if we have uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
  if [[ "$DRY_RUN" != true ]]; then
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${RED}Aborted${NC}"
      exit 1
    fi
  fi
fi

# Navigate to root directory
cd "$ROOT_DIR"

# Check if required tools are installed
if ! command -v changeset &> /dev/null && ! npx changeset --version &> /dev/null; then
  echo -e "${RED}Error: changesets CLI not found${NC}"
  echo "Please install changesets: pnpm add -D @changesets/cli"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo -e "${RED}Error: jq is required for JSON processing${NC}"
  echo "Please install jq: https://stedolan.github.io/jq/download/"
  exit 1
fi

# Create snapshot versions
echo -e "\n${GREEN}Creating snapshot versions...${NC}"
if [[ "$DRY_RUN" == true ]]; then
  echo "(DRY RUN) Would run: pnpm changeset version --snapshot ${TAG}"
else
  pnpm changeset version --snapshot "${TAG}"
  
  # Mark that cleanup is needed from this point
  CLEANUP_NEEDED=true
  
  # Update JSR versions to match
  echo -e "\n${GREEN}Syncing JSR versions...${NC}"
  ./scripts/update-jsr-json-version.sh
fi

# Show what would be published
echo -e "\n${GREEN}Packages to be published:${NC}"
SNAPSHOT_PACKAGES=""
if [[ "$DRY_RUN" == true ]]; then
  echo "(DRY RUN) Would show packages with version 0.0.0-${TAG}-*"
else
  # Find packages with snapshot versions
  while IFS= read -r pkg; do
    if grep -q "\"version\": \"0.0.0-" "$pkg" 2>/dev/null; then
      PKG_NAME=$(jq -r .name "$pkg" 2>/dev/null || echo "unknown")
      PKG_VERSION=$(jq -r .version "$pkg" 2>/dev/null || echo "unknown")
      echo -e "  ${BLUE}${PKG_NAME}${NC} @ ${YELLOW}${PKG_VERSION}${NC}"
      SNAPSHOT_PACKAGES="${SNAPSHOT_PACKAGES}${PKG_NAME}@${PKG_VERSION}\n"
    fi
  done < <(find pkgs -name "package.json" -not -path "*/node_modules/*")
fi

# Publish to npm
# IMPORTANT: We use --tag snapshot to avoid polluting the "latest" tag
# npm ALWAYS requires a dist-tag, so we use "snapshot" which users won't accidentally install
if [[ "$DRY_RUN" == true ]]; then
  echo -e "\n${YELLOW}DRY RUN: Skipping npm publish${NC}"
  echo "Would run: pnpm changeset publish --tag snapshot ${NO_GIT_TAG}"
else
  echo -e "\n${GREEN}Publishing to npm with 'snapshot' tag (to protect 'latest')...${NC}"
  pnpm changeset publish --tag snapshot ${NO_GIT_TAG}
fi

# Publish edge-worker to JSR (without dist-tags)
if [[ "$DRY_RUN" == true ]]; then
  echo -e "\n${YELLOW}DRY RUN: Skipping JSR publish${NC}"
  echo "Would run: cd pkgs/edge-worker && jsr publish --allow-slow-types"
else
  if [[ -f "pkgs/edge-worker/jsr.json" ]]; then
    echo -e "\n${GREEN}Publishing edge-worker to JSR...${NC}"
    (cd pkgs/edge-worker && jsr publish --allow-slow-types || true)
  fi
fi

# Print installation instructions
if [[ "$DRY_RUN" != true ]]; then
  echo -e "\n${GREEN}=== Snapshot Release Complete! ===${NC}"
  echo -e "\n${BLUE}Copy and paste to install:${NC}\n"
  
  # Create machine-readable output for CI
  SNAPSHOT_OUTPUT_FILE="/tmp/snapshot-release-output.json"
  echo '{"packages":[' > "$SNAPSHOT_OUTPUT_FILE"
  FIRST_PKG=true
  
  # Print npm install commands
  echo -e "${YELLOW}# NPM packages:${NC}"
  while IFS= read -r pkg; do
    if grep -q "\"version\": \"0.0.0-" "$pkg" 2>/dev/null; then
      PKG_NAME=$(jq -r .name "$pkg" 2>/dev/null || echo "unknown")
      PKG_VERSION=$(jq -r .version "$pkg" 2>/dev/null || echo "unknown")
      if [[ "$PKG_NAME" != "@pgflow/edge-worker" ]]; then
        echo "npm install ${PKG_NAME}@${PKG_VERSION}"
        # Add to JSON output
        if [[ "$FIRST_PKG" != true ]]; then echo "," >> "$SNAPSHOT_OUTPUT_FILE"; fi
        echo -n "{\"name\":\"${PKG_NAME}\",\"version\":\"${PKG_VERSION}\",\"registry\":\"npm\"}" >> "$SNAPSHOT_OUTPUT_FILE"
        FIRST_PKG=false
      fi
    fi
  done < <(find pkgs -name "package.json" -not -path "*/node_modules/*")
  
  # Print JSR install command
  if [[ -f "pkgs/edge-worker/jsr.json" ]]; then
    EDGE_WORKER_VERSION=$(jq -r .version "pkgs/edge-worker/jsr.json" 2>/dev/null || echo "unknown")
    echo -e "\n${YELLOW}# JSR package:${NC}"
    echo "deno add @pgflow/edge-worker@${EDGE_WORKER_VERSION}"
    echo -e "\n${YELLOW}# Or in import map:${NC}"
    echo "\"@pgflow/edge-worker\": \"jsr:@pgflow/edge-worker@${EDGE_WORKER_VERSION}\""
    # Add to JSON output
    if [[ "$FIRST_PKG" != true ]]; then echo "," >> "$SNAPSHOT_OUTPUT_FILE"; fi
    echo -n "{\"name\":\"@pgflow/edge-worker\",\"version\":\"${EDGE_WORKER_VERSION}\",\"registry\":\"jsr\"}" >> "$SNAPSHOT_OUTPUT_FILE"
  fi
  
  echo "]}" >> "$SNAPSHOT_OUTPUT_FILE"
  echo -e "\n${GREEN}Machine-readable output saved to: ${SNAPSHOT_OUTPUT_FILE}${NC}"
fi

# Cleanup happens automatically via trap on exit