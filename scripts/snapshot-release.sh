#!/bin/bash
set -euo pipefail

# Helper script for creating and publishing snapshot releases
# Safe to use both locally and in CI on branches

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

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
NPM_TAG="snapshot" # Default npm tag
JSR_TAG="experimental" # Default JSR tag

# Function to print usage
usage() {
  echo "Usage: $0 [snapshot-tag] [options]"
  echo ""
  echo "Options:"
  echo "  --dry-run         Run without actually publishing"
  echo "  --npm-tag TAG     NPM dist tag to use (default: snapshot)"
  echo "  --jsr-tag TAG     JSR dist tag to use (default: experimental)"
  echo "  --help            Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0                      # Create snapshot with branch name as tag"
  echo "  $0 my-feature           # Create snapshot with 'my-feature' tag"
  echo "  $0 fix-123 --dry-run    # Dry run for 'fix-123' snapshot"
  echo "  $0 test --npm-tag next  # Use 'next' as npm tag"
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --npm-tag)
      NPM_TAG="$2"
      shift 2
      ;;
    --jsr-tag)
      JSR_TAG="$2"
      shift 2
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
    # Clean branch name to be npm-compatible
    TAG=$(echo "$BRANCH_NAME" | sed 's/[^a-zA-Z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  else
    # Fallback to short commit hash
    TAG=$(git rev-parse --short HEAD)
  fi
fi

echo -e "${GREEN}=== pgflow Snapshot Release ===${NC}"
echo -e "${GREEN}Snapshot tag: ${YELLOW}${TAG}${NC}"
echo -e "${GREEN}NPM dist tag: ${YELLOW}${NPM_TAG}${NC}"
echo -e "${GREEN}JSR dist tag: ${YELLOW}${JSR_TAG}${NC}"
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

# Check if changesets are installed
if ! command -v changeset &> /dev/null && ! npx changeset --version &> /dev/null; then
  echo -e "${RED}Error: changesets CLI not found${NC}"
  echo "Please install changesets: pnpm add -D @changesets/cli"
  exit 1
fi

# Store original package versions for restoration
echo -e "${GREEN}Saving original package versions...${NC}"
ORIGINAL_VERSIONS=$(find pkgs -name "package.json" -not -path "*/node_modules/*" -exec sh -c 'echo "{}:$(jq -r .version "{}")"' \;)

# Create snapshot versions
echo -e "\n${GREEN}Creating snapshot versions...${NC}"
if [[ "$DRY_RUN" == true ]]; then
  echo "(DRY RUN) Would run: pnpm changeset version --snapshot ${TAG}"
else
  pnpm changeset version --snapshot "${TAG}"
  
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
if [[ "$DRY_RUN" == true ]]; then
  echo -e "\n${YELLOW}DRY RUN: Skipping npm publish${NC}"
  echo "Would run: pnpm changeset publish --tag ${NPM_TAG} ${NO_GIT_TAG}"
else
  echo -e "\n${GREEN}Publishing to npm...${NC}"
  pnpm changeset publish --tag "${NPM_TAG}" ${NO_GIT_TAG}
fi

# Publish edge-worker to JSR
if [[ "$DRY_RUN" == true ]]; then
  echo -e "\n${YELLOW}DRY RUN: Skipping JSR publish${NC}"
  echo "Would run: cd pkgs/edge-worker && jsr publish --allow-slow-types --tag ${JSR_TAG}"
else
  if [[ -f "pkgs/edge-worker/jsr.json" ]]; then
    echo -e "\n${GREEN}Publishing edge-worker to JSR...${NC}"
    (cd pkgs/edge-worker && jsr publish --allow-slow-types --tag "${JSR_TAG}" || true)
  fi
fi

# Print installation instructions
if [[ "$DRY_RUN" != true ]]; then
  echo -e "\n${GREEN}=== Snapshot Release Complete! ===${NC}"
  echo -e "\n${BLUE}Install from npm:${NC}"
  echo -e "  npm install <package>@${NPM_TAG}"
  echo -e "  # or specific version:"
  echo -e "  npm install <package>@0.0.0-${TAG}-TIMESTAMP"
  
  if [[ -f "pkgs/edge-worker/jsr.json" ]]; then
    echo -e "\n${BLUE}Install from JSR:${NC}"
    echo -e "  deno add @pgflow/edge-worker@${JSR_TAG}"
    echo -e "  # or in import map:"
    echo -e "  \"@pgflow/edge-worker\": \"jsr:@pgflow/edge-worker@${JSR_TAG}\""
  fi
  
  echo -e "\n${BLUE}Published packages:${NC}"
  echo -e "$SNAPSHOT_PACKAGES"
fi

# Cleanup - restore original versions
if [[ "$DRY_RUN" != true ]]; then
  echo -e "\n${GREEN}Restoring original versions...${NC}"
  
  # Restore package.json files
  git checkout -- "**/package.json" 2>/dev/null || true
  
  # Restore jsr.json files
  git checkout -- "**/jsr.json" 2>/dev/null || true
  
  # Restore lock files
  git checkout -- "pnpm-lock.yaml" "package-lock.json" "yarn.lock" 2>/dev/null || true
  
  echo -e "${GREEN}Original versions restored - branch is clean!${NC}"
fi