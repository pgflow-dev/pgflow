#!/usr/bin/env bash
set -euo pipefail               # abort on first error, unset var or pipe-fail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# Quick check for required tool
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

# ------------------------------------------------------------------
# 1. Resolve snapshot tag
# ------------------------------------------------------------------
TAG=${1:-}                      # first arg or empty
if [[ -z $TAG ]]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [[ $BRANCH != "main" && $BRANCH != "HEAD" ]]; then
    TAG=$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')
    # Handle edge case where tag becomes only dashes
    [[ $TAG =~ ^-+$ ]] && TAG=$(git rev-parse --short HEAD)
  else
    TAG=$(git rev-parse --short HEAD)
  fi
fi

TS=$(date +%Y%m%d%H%M%S)
SHA=$(git rev-parse --short HEAD)
SNAPSHOT="$TAG-$TS-$SHA"        # 0.0.0-TAG-TIMESTAMP-SHA will be added by changesets

# ------------------------------------------------------------------
# 2. Clean-up on exit (always keep branch clean)
# ------------------------------------------------------------------
trap 'git restore --source=HEAD --worktree --staged \
      "**/package.json" "**/jsr.json" pnpm-lock.yaml 2>/dev/null || true' EXIT

# ------------------------------------------------------------------
# 3. Create versions
# ------------------------------------------------------------------
pnpm changeset version --snapshot "$SNAPSHOT"
"$ROOT/scripts/update-jsr-json-version.sh"          # keep JSR versions in sync

# ------------------------------------------------------------------
# 4. Collect list of packages only once
# ------------------------------------------------------------------
mapfile -t PKGS < <(
  find pkgs -name package.json -not -path "*/node_modules/*" -print0 |
  xargs -0 jq -r '.name + "@" + .version' |
  grep '^@pgflow/.*0\.0\.0-'                 # only freshly versioned snapshots
)

[[ ${#PKGS[@]} -eq 0 ]] && { echo "Nothing to publish, aborting"; exit 1; }

echo "Publishing the following packages:"
printf '  %s\n' "${PKGS[@]}"

# ------------------------------------------------------------------
# 5. Publish – npm first, then JSR
# ------------------------------------------------------------------
pnpm changeset publish --tag snapshot --no-git-tag-version

if [[ -f pkgs/edge-worker/jsr.json ]]; then
  ( cd pkgs/edge-worker && pnpm jsr publish --allow-slow-types --allow-dirty ) \
    || echo "⚠️  JSR publish failed (continuing)"
fi

# ------------------------------------------------------------------
# 6. Show ready-to-copy install commands
# ------------------------------------------------------------------
echo -e "\nInstall snapshot versions with:"
for P in "${PKGS[@]}"; do
  [[ $P == "@pgflow/edge-worker"* ]] && continue
  echo "npm install $P"
done

if [[ -f pkgs/edge-worker/jsr.json ]]; then
  EDGE_VER=$(jq -r '.version' pkgs/edge-worker/jsr.json)
  echo ""
  echo "# JSR (for Deno/Supabase Edge Functions):"
  echo "import { EdgeWorker } from \"jsr:@pgflow/edge-worker@$EDGE_VER\""
fi