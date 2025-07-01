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
    # Try git restore first (git 2.23+), fallback to git checkout for older versions
    if git restore --source=HEAD -- ':/**/package.json' ':/**/jsr.json' pnpm-lock.yaml package-lock.yaml yarn.lock 2>/dev/null; then
      echo -e "${GREEN}Original versions restored - branch is clean!${NC}"
    elif git checkout HEAD -- '**/package.json' '**/jsr.json' pnpm-lock.yaml package-lock.yaml yarn.lock 2>/dev/null; then
      echo -e "${GREEN}Original versions restored - branch is clean!${NC}"
    else
      echo -e "${YELLOW}Warning: Could not automatically restore versions. You may need to manually reset changes.${NC}"
    fi
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
ALLOW_UNCOMMITTED_CHANGESETS=false

# Function to print usage
usage() {
  echo "Usage: $0 [snapshot-tag] [options]"
  echo ""
  echo "Options:"
  echo "  --dry-run                      Run without actually publishing"
  echo "  --allow-uncommitted-changesets Allow uncommitted changeset files"
  echo "  --help                         Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0                      # Create snapshot with branch name as tag"
  echo "  $0 my-feature           # Create snapshot with 'my-feature' tag"
  echo "  $0 fix-123 --dry-run    # Dry run for 'fix-123' snapshot"
  echo "  $0 --allow-uncommitted-changesets  # Allow dirty changesets"
  echo ""
  echo "Note: Packages are published with exact versions (no dist-tags)"
  echo "      Install with: npm install @pgflow/core@0.0.0-TAG-TIMESTAMP-SHA"
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --allow-uncommitted-changesets)
      ALLOW_UNCOMMITTED_CHANGESETS=true
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

# Validate tag format (npm package name rules)
if [[ ! "$TAG" =~ ^[a-z0-9][a-z0-9-]{0,127}$ ]]; then
  echo -e "${RED}Error: Invalid tag format '${TAG}'${NC}"
  echo -e "${YELLOW}Tag must start with lowercase letter or number, and contain only lowercase letters, numbers, and hyphens.${NC}"
  echo -e "${YELLOW}Maximum length: 128 characters${NC}"
  exit 1
fi

echo -e "${GREEN}=== pgflow Snapshot Release ===${NC}"
echo -e "${GREEN}Snapshot tag: ${YELLOW}${TAG}${NC}"
echo ""

# Check if we have uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"

  # Check specifically for uncommitted changesets
  if git ls-files --others --exclude-standard .changeset/*.md | grep -q .; then
    if [[ "$ALLOW_UNCOMMITTED_CHANGESETS" == true ]]; then
      echo -e "${YELLOW}Note: Proceeding with uncommitted changeset files (--allow-uncommitted-changesets)${NC}"
    else
      echo -e "${RED}Error: Uncommitted changeset files detected!${NC}"
      echo -e "${YELLOW}Please commit your changesets before creating a snapshot release.${NC}"
      echo -e "\nThis prevents losing your changeset messages during cleanup."
      echo -e "\nYou can either:"
      echo -e "  1. Commit your changesets: ${GREEN}git add .changeset/*.md && git commit -m 'Add changeset'${NC}"
      echo -e "  2. Use the flag: ${GREEN}--allow-uncommitted-changesets${NC}"
      exit 1
    fi
  fi

  if [[ "$DRY_RUN" != true ]]; then
    # In CI, abort on uncommitted changes. In interactive mode, ask.
    if [[ -t 0 ]]; then
      read -p "Continue with other uncommitted changes? (y/N) " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborted${NC}"
        exit 1
      fi
    else
      echo -e "${RED}Error: Uncommitted changes detected in CI environment${NC}"
      exit 1
    fi
  fi
fi

# Navigate to root directory
cd "$ROOT_DIR"

# Check if required tools are installed
MISSING_TOOLS=()
for tool in pnpm changeset jq jsr; do
  if ! command -v "$tool" &> /dev/null; then
    MISSING_TOOLS+=("$tool")
  fi
done

# Special check for changeset via npx
if [[ " ${MISSING_TOOLS[@]} " =~ " changeset " ]] && command -v npx &> /dev/null && npx changeset --version &> /dev/null 2>&1; then
  # Remove changeset from missing tools if npx can run it
  MISSING_TOOLS=("${MISSING_TOOLS[@]/changeset}")
fi

if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
  echo -e "${RED}Error: Missing required tools: ${MISSING_TOOLS[*]}${NC}"
  echo -e "\nPlease install:"
  for tool in "${MISSING_TOOLS[@]}"; do
    case "$tool" in
      pnpm) echo "  - pnpm: https://pnpm.io/installation" ;;
      changeset) echo "  - changesets: pnpm add -D @changesets/cli" ;;
      jq) echo "  - jq: https://stedolan.github.io/jq/download/" ;;
      jsr) echo "  - jsr: https://jsr.io/docs/cli" ;;
    esac
  done
  exit 1
fi

# Create snapshot versions with unique timestamp
echo -e "\n${GREEN}Creating snapshot versions...${NC}"

# Generate unique timestamp with milliseconds to avoid duplicates
TIMESTAMP=$(date +%Y%m%d%H%M%S)
SHORT_SHA=$(git rev-parse --short HEAD)
UNIQUE_TAG="${TAG}-${TIMESTAMP}-${SHORT_SHA}"

if [[ "$DRY_RUN" == true ]]; then
  echo "(DRY RUN) Would run: pnpm changeset version --snapshot ${UNIQUE_TAG}"
else
  # Capture output to check for warnings
  # In CI, ensure we don't get interactive prompts
  if [[ -t 0 ]]; then
    VERSION_OUTPUT=$(pnpm changeset version --snapshot "${UNIQUE_TAG}" 2>&1)
  else
    VERSION_OUTPUT=$(CI=true pnpm changeset version --snapshot "${UNIQUE_TAG}" 2>&1)
  fi
  echo "$VERSION_OUTPUT"

  # Check if changesets warned about no unreleased changesets
  if echo "$VERSION_OUTPUT" | grep -q "No unreleased changesets found"; then
    echo -e "\n${YELLOW}Warning: No changesets found!${NC}"
    echo -e "${YELLOW}Snapshot releases require changesets to determine which packages to publish.${NC}"
    echo -e "\nTo create a snapshot release:"
    echo -e "  1. Run ${GREEN}pnpm changeset${NC} to create a changeset"
    echo -e "  2. Run this script again"
    echo -e "\n${RED}Aborting to prevent publishing existing versions.${NC}"
    exit 1
  fi

  # Mark that cleanup is needed from this point
  CLEANUP_NEEDED=true

  # Update JSR versions to match
  echo -e "\n${GREEN}Syncing JSR versions...${NC}"
  "${SCRIPT_DIR}/update-jsr-json-version.sh"
fi

# Show what would be published
echo -e "\n${GREEN}Packages to be published:${NC}"
SNAPSHOT_PACKAGES=""
SNAPSHOT_COUNT=0

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
      ((SNAPSHOT_COUNT++))
    fi
  done < <(find pkgs -name "package.json" -not -path "*/node_modules/*")

  # Safety check: ensure we have snapshot versions before proceeding
  if [[ $SNAPSHOT_COUNT -eq 0 ]]; then
    echo -e "\n${RED}Error: No snapshot versions found!${NC}"
    echo -e "${YELLOW}This usually means no changesets were applied.${NC}"
    echo -e "\nPlease ensure you have:"
    echo -e "  1. Created changesets with ${GREEN}pnpm changeset${NC}"
    echo -e "  2. Not already published these changes"
    exit 1
  fi
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
  echo "Would run: cd pkgs/edge-worker && jsr publish --allow-slow-types --allow-dirty"
else
  if [[ -f "pkgs/edge-worker/jsr.json" ]]; then
    echo -e "\n${GREEN}Publishing edge-worker to JSR...${NC}"
    # Use --allow-dirty since we have uncommitted version changes
    if ! (cd "pkgs/edge-worker" && pnpm jsr publish --allow-slow-types --allow-dirty); then
      echo -e "${YELLOW}Warning: JSR publish failed - continuing${NC}"
      echo -e "${YELLOW}You may need to manually publish to JSR or check your authentication${NC}"
    fi
  fi
fi

# Print installation instructions
if [[ "$DRY_RUN" != true ]]; then
  echo -e "\n${GREEN}=== Snapshot Release Complete! ===${NC}"
  echo -e "\n${BLUE}Copy and paste to install:${NC}\n"

  # Create machine-readable output for CI
  SNAPSHOT_OUTPUT_DIR="${TMPDIR:-/tmp}"
  SNAPSHOT_OUTPUT_FILE="${SNAPSHOT_OUTPUT_DIR}/snapshot-release-output.json"
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
  if [[ -f "$SNAPSHOT_OUTPUT_FILE" ]]; then
    echo -e "\n${GREEN}Machine-readable output saved to: ${SNAPSHOT_OUTPUT_FILE}${NC}"
  else
    echo -e "\n${YELLOW}Warning: Failed to create machine-readable output file${NC}"
  fi
fi

# Cleanup happens automatically via trap on exit
