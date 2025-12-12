#!/usr/bin/env bash
set -euo pipefail               # abort on first error, unset var or pipe-fail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# Quick check for requirements
command -v jq >/dev/null || { echo "jq is required"; exit 1; }
[[ ${BASH_VERSINFO[0]} -lt 4 ]] && {
  echo "Bash 4+ required (macOS: brew install bash)"; exit 1;
}

# ------------------------------------------------------------------
# Color variables for output formatting
# ------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ------------------------------------------------------------------
# Parse arguments
# ------------------------------------------------------------------
TAG=""
SKIP_CONFIRMATION=false
NO_CLEANUP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --yes|-y)
      SKIP_CONFIRMATION=true
      shift
      ;;
    --no-cleanup)
      NO_CLEANUP=true
      shift
      ;;
    --help)
      echo "Usage: $0 [tag] [--yes] [--no-cleanup]"
      echo ""
      echo "Create and publish snapshot releases for testing"
      echo ""
      echo "Arguments:"
      echo "  tag              Custom snapshot tag (default: branch name)"
      echo ""
      echo "Options:"
      echo "  --yes, -y        Skip confirmation prompt"
      echo "  --no-cleanup     Keep modified files after successful publish"
      echo "  --help           Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                     # Use branch name as tag"
      echo "  $0 my-feature          # Custom tag"
      echo "  $0 my-feature --yes    # Skip confirmation"
      exit 0
      ;;
    *)
      if [[ -z "$TAG" ]]; then
        TAG="$1"
      else
        echo -e "${RED}Error: Unknown argument '$1'${NC}"
        echo "Run with --help for usage"
        exit 1
      fi
      shift
      ;;
  esac
done

# ------------------------------------------------------------------
# Authenticate for publishing (token env vars or browser login)
# ------------------------------------------------------------------
echo "Checking authentication..."

# NPM authentication
if [[ -n "${NPM_TOKEN:-}" ]]; then
  # Token provided - try to get user info (may fail with some token types)
  if NPM_USER=$(npm whoami 2>/dev/null); then
    echo -e "  ${GREEN}✓${NC} npm: authenticated as ${BOLD}$NPM_USER${NC} (via token)"
  else
    echo -e "  ${YELLOW}!${NC} npm: NPM_TOKEN set (whoami check failed, will verify at publish)"
  fi
else
  # No token - check if already logged in, otherwise prompt browser login
  if NPM_USER=$(npm whoami 2>/dev/null); then
    echo -e "  ${GREEN}✓${NC} npm: authenticated as ${BOLD}$NPM_USER${NC} (existing session)"
  else
    echo -e "  ${YELLOW}npm: not logged in - opening browser...${NC}"
    if npm login --auth-type=web; then
      NPM_USER=$(npm whoami)
      echo -e "  ${GREEN}✓${NC} npm: authenticated as ${BOLD}$NPM_USER${NC}"
    else
      echo -e "${RED}Error: npm login failed${NC}"
      exit 1
    fi
  fi
fi

# JSR authentication - always validate with dry-run
JSR_DRY_RUN_CMD="pnpm jsr publish --dry-run --allow-slow-types --allow-dirty"
if [[ -n "${JSR_TOKEN:-}" ]]; then
  JSR_DRY_RUN_CMD="$JSR_DRY_RUN_CMD --token $JSR_TOKEN"
fi
JSR_CHECK=$(cd pkgs/edge-worker && $JSR_DRY_RUN_CMD 2>&1 || true)
if echo "$JSR_CHECK" | grep -qi "unauthorized\|not logged in\|authentication"; then
  if [[ -n "${JSR_TOKEN:-}" ]]; then
    echo -e "  ${YELLOW}!${NC} jsr: JSR_TOKEN set but invalid/expired - opening browser..."
  else
    echo -e "  ${YELLOW}jsr: not logged in - opening browser...${NC}"
  fi
  if deno login; then
    echo -e "  ${GREEN}✓${NC} jsr: authenticated via browser"
  else
    echo -e "${RED}Error: JSR login failed${NC}"
    exit 1
  fi
else
  if [[ -n "${JSR_TOKEN:-}" ]]; then
    echo -e "  ${GREEN}✓${NC} jsr: authenticated (via token)"
  else
    echo -e "  ${GREEN}✓${NC} jsr: authenticated (existing session)"
  fi
fi

echo ""

# ------------------------------------------------------------------
# Resolve snapshot tag if not provided
# ------------------------------------------------------------------
if [[ -z $TAG ]]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [[ $BRANCH != "main" && $BRANCH != "HEAD" ]]; then
    TAG=$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed 's/-\+/-/g' | sed 's/^-//;s/-$//')
    # Handle edge case where tag becomes only dashes
    [[ $TAG =~ ^-+$ ]] && TAG=$(git rev-parse --short HEAD)
  else
    TAG=$(git rev-parse --short HEAD)
  fi
fi

# Generate version components
SHA=$(git rev-parse --short HEAD)
SNAPSHOT="$TAG-$SHA"  # Pass tag with SHA to changeset (it will add timestamp)

# Cleanup function (to be called after successful publish)
cleanup_snapshot_files() {
  echo ""
  echo -e "${YELLOW}Cleaning up snapshot files...${NC}"
  git restore --source=HEAD --worktree --staged \
    "**/package.json" "**/jsr.json" "**/CHANGELOG.md" 2>/dev/null || true
  git restore --source=HEAD --worktree --staged \
    pnpm-lock.yaml 2>/dev/null || true
  git restore --source=HEAD --worktree --staged \
    .changeset/ 2>/dev/null || true
  git clean -fd .changeset 2>/dev/null || true
  echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# ------------------------------------------------------------------
# Display snapshot version info
# ------------------------------------------------------------------
echo ""
echo -e "${BOLD}📦 Snapshot Release${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Version template:${NC} ${GREEN}0.0.0-$SNAPSHOT-<timestamp>${NC}"
echo ""
echo -e "  ${BOLD}Tag:${NC}       $TAG"
echo -e "  ${BOLD}Commit:${NC}    $SHA"
echo -e "  ${YELLOW}Note:${NC} Changeset will add timestamp automatically"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ------------------------------------------------------------------
# Pre-flight check: Ensure working directory is clean
# ------------------------------------------------------------------
echo -e "${BOLD}Checking working directory...${NC}"

# Check if any files we'll modify are dirty
DIRTY_FILES=$(git status --porcelain 2>/dev/null | grep -E "^\s*M\s+(.*/)?(package\.json|jsr\.json|CHANGELOG\.md|pnpm-lock\.yaml)$" || true)

if [[ -n "$DIRTY_FILES" ]]; then
  echo -e "${RED}✗ Working directory has uncommitted changes${NC}"
  echo ""
  echo "The following files have uncommitted changes:"
  echo "$DIRTY_FILES" | while read -r line; do
    echo -e "  ${YELLOW}${line}${NC}"
  done
  echo ""
  echo -e "${BOLD}Please commit or stash your changes first:${NC}"
  echo -e "  ${BLUE}git add . && git commit -m 'Your message'${NC}"
  echo -e "  ${BLUE}# or${NC}"
  echo -e "  ${BLUE}git stash${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Working directory clean${NC}"
echo ""

# ------------------------------------------------------------------
# Check for unreleased changesets
# ------------------------------------------------------------------
echo -e "${BOLD}Checking for changesets...${NC}"

# Check for changeset files (either committed or uncommitted)
CHANGESET_FILES=$(find .changeset -name "*.md" -not -name "README.md" 2>/dev/null || true)

if [[ -z "$CHANGESET_FILES" ]]; then
  echo -e "${RED}✗ No changeset files found${NC}"
  echo ""
  echo "Create a changeset first:"
  echo -e "  ${BLUE}pnpm exec changeset${NC}"
  exit 1
fi

# Verify changesets will create versions
if ! pnpm exec changeset status 2>/dev/null | grep -q -E "(packages will be released|Packages to be bumped)" ; then
  echo -e "${RED}✗ No packages to release from changesets${NC}"
  echo ""
  echo "Changeset files found but no packages will be bumped."
  echo "This might mean changesets are already released."
  exit 1
fi

echo -e "${GREEN}✓ Found unreleased changesets${NC}"
echo ""

# ------------------------------------------------------------------
# Create snapshot versions
# ------------------------------------------------------------------
echo -e "${BOLD}Creating snapshot versions...${NC}"
pnpm exec changeset version --snapshot "$SNAPSHOT" > /dev/null 2>&1
"$ROOT/scripts/update-jsr-json-version.sh" > /dev/null 2>&1
echo -e "${GREEN}✓ Versions updated${NC}"
echo ""

# ------------------------------------------------------------------
# Collect packages to publish
# ------------------------------------------------------------------
echo -e "${BOLD}Packages to publish:${NC}"
echo ""

# Collect npm packages (only those matching current snapshot tag)
NPM_PKGS=()
while IFS= read -r -d '' file; do
  PKG_INFO=$(jq -r --arg snapshot "$SNAPSHOT" \
    'select(.version | test("^0\\.0\\.0-" + $snapshot)) | .name + "@" + .version' \
    "$file" 2>/dev/null)
  if [[ -n "$PKG_INFO" ]]; then
    NPM_PKGS+=("$PKG_INFO")
    NAME=$(echo "$PKG_INFO" | cut -d'@' -f1-2)
    VERSION=$(echo "$PKG_INFO" | rev | cut -d'@' -f1 | rev)
    echo -e "  ${GREEN}✓${NC} ${BOLD}$NAME${NC}"
    echo -e "    ${VERSION}"
  fi
done < <(find pkgs -name package.json -not -path "*/node_modules/*" -not -path "*/dist/*" -print0)

# Check for JSR package (edge-worker)
if [[ -f pkgs/edge-worker/jsr.json ]]; then
  JSR_VERSION=$(jq -r '.version' pkgs/edge-worker/jsr.json)
  if [[ "$JSR_VERSION" =~ ^0\.0\.0-${SNAPSHOT} ]]; then
    echo -e "  ${GREEN}✓${NC} ${BOLD}@pgflow/edge-worker${NC} (JSR)"
    echo -e "    ${JSR_VERSION}"
  fi
fi

echo ""

# Check if we have anything to publish
if [[ ${#NPM_PKGS[@]} -eq 0 ]]; then
  echo -e "${RED}No packages to publish${NC}"
  echo "This might happen if changesets didn't create any versions."
  exit 1
fi


# ------------------------------------------------------------------
# Confirmation prompt (unless --yes)
# ------------------------------------------------------------------
if [[ "$SKIP_CONFIRMATION" != "true" ]]; then
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}Ready to build and publish these packages?${NC}"
  echo ""
  echo -e "This will:"
  echo -e "  1. Build all packages (${BLUE}pnpm nx run-many -t build${NC})"
  echo -e "  2. Publish to npm registry with ${BOLD}snapshot${NC} tag"
  if [[ -f pkgs/edge-worker/jsr.json ]]; then
    echo -e "  3. Publish edge-worker to JSR registry"
  fi
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo ""

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
  fi
fi

# ------------------------------------------------------------------
# Build packages
# ------------------------------------------------------------------
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Building packages...${NC}"
echo ""

if pnpm nx run-many -t build --exclude=demo,website ; then
  echo -e "${GREEN}✓ Packages built successfully${NC}"
else
  echo -e "${RED}✗ Build failed${NC}"
  exit 1
fi

# ------------------------------------------------------------------
# Publish packages
# ------------------------------------------------------------------
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Publishing packages...${NC}"
echo ""

# Track publish success
NPM_SUCCESS=false
JSR_SUCCESS=true  # Default true (only set false if JSR package exists and fails)
JSR_PUBLISHED_VERSION=""  # Track JSR version if published

# Publish to npm (exclude edge-worker which goes to JSR only)
echo -e "${BOLD}Publishing to npm...${NC}"
if pnpm publish --recursive --tag snapshot --no-git-checks --filter='!./pkgs/edge-worker' ; then
  echo -e "${GREEN}✓ npm packages published${NC}"
  NPM_SUCCESS=true
else
  echo -e "${RED}✗ npm publish failed - check output above${NC}"
fi

# Publish to JSR
if [[ -f pkgs/edge-worker/jsr.json ]]; then
  # Capture the snapshot version before publishing
  JSR_PUBLISHED_VERSION=$(jq -r '.version' pkgs/edge-worker/jsr.json)
  echo ""
  echo -e "${BOLD}Publishing to JSR...${NC}"
  JSR_PUBLISH_CMD="pnpm jsr publish --allow-slow-types --allow-dirty"
  if [[ -n "${JSR_TOKEN:-}" ]]; then
    JSR_PUBLISH_CMD="$JSR_PUBLISH_CMD --token $JSR_TOKEN"
  fi
  if ( cd pkgs/edge-worker && $JSR_PUBLISH_CMD ) ; then
    echo -e "${GREEN}✓ JSR package published${NC}"
  else
    echo -e "${RED}✗ JSR publish failed${NC}"
    JSR_SUCCESS=false
    JSR_PUBLISHED_VERSION=""  # Clear version since publish failed
  fi
fi

# ------------------------------------------------------------------
# Cleanup snapshot files (only if publish succeeded)
# ------------------------------------------------------------------
if [[ "$NPM_SUCCESS" == "true" ]] && [[ "$JSR_SUCCESS" == "true" ]]; then
  if [[ "$NO_CLEANUP" != "true" ]]; then
    cleanup_snapshot_files
  fi
else
  echo ""
  echo -e "${RED}✗ Publishing failed - keeping files for debugging${NC}"
  echo -e "${YELLOW}Run the following to clean up manually:${NC}"
  echo -e "${BLUE}git restore --source=HEAD --worktree --staged \"**/package.json\" \"**/jsr.json\" \"**/CHANGELOG.md\" pnpm-lock.yaml .changeset/${NC}"
  echo -e "${BLUE}git clean -fd .changeset${NC}"
  exit 1
fi

# ------------------------------------------------------------------
# Display installation instructions
# ------------------------------------------------------------------

# Extract versions for output
PGFLOW_VERSION=""
DSL_VERSION=""
CORE_VERSION=""
for PKG in "${NPM_PKGS[@]}"; do
  if [[ $PKG == "pgflow@"* ]]; then
    PGFLOW_VERSION=$(echo "$PKG" | rev | cut -d'@' -f1 | rev)
  elif [[ $PKG == "@pgflow/dsl@"* ]]; then
    DSL_VERSION=$(echo "$PKG" | rev | cut -d'@' -f1 | rev)
  elif [[ $PKG == "@pgflow/core@"* ]]; then
    CORE_VERSION=$(echo "$PKG" | rev | cut -d'@' -f1 | rev)
  fi
done

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Snapshot release complete!${NC}"
echo ""

# Raw version for easy selection
echo -e "${BOLD}Version:${NC}  ${GREEN}${PGFLOW_VERSION}${NC}"
echo ""

# npx command
echo -e "${BOLD}Install pgflow CLI:${NC}"
echo -e "${BLUE}npx -y pgflow@${PGFLOW_VERSION} install${NC}"
echo ""

# Deno/Supabase imports
echo -e "${BOLD}Deno/Supabase Edge Function imports:${NC}"
if [[ -n "$JSR_PUBLISHED_VERSION" ]]; then
  echo -e "${BLUE}import { EdgeWorker } from \"jsr:@pgflow/edge-worker@$JSR_PUBLISHED_VERSION\";${NC}"
fi
if [[ -n "$DSL_VERSION" ]]; then
  echo -e "${BLUE}import { Flow } from \"npm:@pgflow/dsl@$DSL_VERSION\";${NC}"
  echo -e "${BLUE}import { Flow } from \"npm:@pgflow/dsl@$DSL_VERSION/supabase\";${NC}"
fi
echo ""

# Deno import map
echo -e "${BOLD}Add to deno.json imports:${NC}"
echo ""
echo -e "${BLUE}{"
echo -e "  \"imports\": {"

# Show core (npm)
if [[ -n "$CORE_VERSION" ]]; then
  echo -e "    \"@pgflow/core\": \"npm:@pgflow/core@$CORE_VERSION\","
  echo -e "    \"@pgflow/core/\": \"npm:@pgflow/core@$CORE_VERSION/\","
fi

# Show dsl (npm)
if [[ -n "$DSL_VERSION" ]]; then
  echo -e "    \"@pgflow/dsl\": \"npm:@pgflow/dsl@$DSL_VERSION\","
  echo -e "    \"@pgflow/dsl/\": \"npm:@pgflow/dsl@$DSL_VERSION/\","
  if [[ -n "$JSR_PUBLISHED_VERSION" ]]; then
    echo -e "    \"@pgflow/dsl/supabase\": \"npm:@pgflow/dsl@$DSL_VERSION/supabase\","
  else
    echo -e "    \"@pgflow/dsl/supabase\": \"npm:@pgflow/dsl@$DSL_VERSION/supabase\""
  fi
fi

# Show edge-worker (JSR) - only if successfully published
if [[ -n "$JSR_PUBLISHED_VERSION" ]]; then
  echo -e "    \"@pgflow/edge-worker\": \"jsr:@pgflow/edge-worker@$JSR_PUBLISHED_VERSION\","
  echo -e "    \"@pgflow/edge-worker/\": \"jsr:@pgflow/edge-worker@$JSR_PUBLISHED_VERSION/\","
  echo -e "    \"@pgflow/edge-worker/_internal\": \"jsr:@pgflow/edge-worker@$JSR_PUBLISHED_VERSION/_internal\""
fi

echo -e "  }"
echo -e "}${NC}"

echo ""

# ------------------------------------------------------------------
# Optional: Spawn test Supabase project
# ------------------------------------------------------------------
if [[ "$SKIP_CONFIRMATION" != "true" ]]; then
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}Spawn test Supabase project with this version?${NC}"
  echo -e "  Will run: ${BLUE}mksupa new '$TAG' --pgflow='$PGFLOW_VERSION'${NC}"
  echo ""
  read -p "Create test project? (y/N) " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BOLD}Spawning test Supabase project...${NC}"
    if command -v fish >/dev/null 2>&1; then
      fish -c "mksupa new '$TAG' --pgflow='$PGFLOW_VERSION'"
    else
      echo -e "${RED}Error: fish shell not found${NC}"
    fi
  fi
fi

echo ""