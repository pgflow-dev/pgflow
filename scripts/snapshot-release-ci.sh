#!/bin/bash
set -euo pipefail

# CI-specific wrapper for snapshot releases
# Automatically detects PR number, commit SHA, and posts installation instructions

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors for output (may not work in all CI environments)
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect CI environment and extract metadata
CI_DETECTED=false
SNAPSHOT_TAG=""
PR_NUMBER=""
COMMIT_SHA=""
PR_COMMENT_FILE=""

# GitHub Actions
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  CI_DETECTED=true
  echo "Detected GitHub Actions environment"
  
  # Extract PR number if available
  if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
    PR_NUMBER="${GITHUB_REF##*/}"
    SNAPSHOT_TAG="pr-${PR_NUMBER}"
  else
    # Use branch name or commit SHA
    BRANCH_NAME="${GITHUB_REF##*/}"
    if [[ "$BRANCH_NAME" != "main" && "$BRANCH_NAME" != "HEAD" ]]; then
      SNAPSHOT_TAG=$(echo "$BRANCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
    else
      SNAPSHOT_TAG="${GITHUB_SHA:0:7}"
    fi
  fi
  
  COMMIT_SHA="${GITHUB_SHA:0:7}"
  PR_COMMENT_FILE="${GITHUB_STEP_SUMMARY:-/tmp/snapshot-release-summary.md}"
fi

# GitLab CI
if [[ "${GITLAB_CI:-}" == "true" ]]; then
  CI_DETECTED=true
  echo "Detected GitLab CI environment"
  
  if [[ -n "${CI_MERGE_REQUEST_IID:-}" ]]; then
    PR_NUMBER="${CI_MERGE_REQUEST_IID}"
    SNAPSHOT_TAG="mr-${PR_NUMBER}"
  else
    BRANCH_NAME="${CI_COMMIT_REF_NAME:-}"
    if [[ "$BRANCH_NAME" != "main" && -n "$BRANCH_NAME" ]]; then
      SNAPSHOT_TAG=$(echo "$BRANCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
    else
      SNAPSHOT_TAG="${CI_COMMIT_SHORT_SHA:-unknown}"
    fi
  fi
  
  COMMIT_SHA="${CI_COMMIT_SHORT_SHA:-}"
fi

# CircleCI
if [[ "${CIRCLECI:-}" == "true" ]]; then
  CI_DETECTED=true
  echo "Detected CircleCI environment"
  
  if [[ -n "${CIRCLE_PULL_REQUEST:-}" ]]; then
    PR_NUMBER="${CIRCLE_PULL_REQUEST##*/}"
    SNAPSHOT_TAG="pr-${PR_NUMBER}"
  else
    BRANCH_NAME="${CIRCLE_BRANCH:-}"
    if [[ "$BRANCH_NAME" != "main" && -n "$BRANCH_NAME" ]]; then
      SNAPSHOT_TAG=$(echo "$BRANCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
    else
      SNAPSHOT_TAG="${CIRCLE_SHA1:0:7}"
    fi
  fi
  
  COMMIT_SHA="${CIRCLE_SHA1:0:7}"
fi

# Fallback if CI not detected or tag not set
if [[ -z "$SNAPSHOT_TAG" ]]; then
  SNAPSHOT_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "snapshot")
fi

echo -e "${GREEN}=== CI Snapshot Release ===${NC}"
echo -e "Environment: ${CI_DETECTED}"
echo -e "Snapshot tag: ${YELLOW}${SNAPSHOT_TAG}${NC}"
echo -e "Commit SHA: ${COMMIT_SHA}"
echo -e "PR Number: ${PR_NUMBER:-N/A}"
echo ""

# Run the main snapshot release script
SNAPSHOT_LOG="${TMPDIR:-/tmp}/snapshot-release.log"
"${SCRIPT_DIR}/snapshot-release.sh" "$SNAPSHOT_TAG" 2>&1 | tee "$SNAPSHOT_LOG"

# Read machine-readable output
SNAPSHOT_OUTPUT_DIR="${TMPDIR:-/tmp}"
SNAPSHOT_OUTPUT_FILE="${SNAPSHOT_OUTPUT_DIR}/snapshot-release-output.json"

# Generate installation instructions for PR comment
if [[ "$CI_DETECTED" == true && -n "$PR_COMMENT_FILE" ]]; then
  cat > "$PR_COMMENT_FILE" << EOF
## 📦 Snapshot Release Available

A snapshot release has been created for this pull request.

**Commit:** \`${COMMIT_SHA}\`
**Tag:** \`${SNAPSHOT_TAG}\`

### Installation

#### NPM Packages

\`\`\`bash
# Install specific versions:
EOF

  # Generate install commands from JSON output
  if [[ -f "$SNAPSHOT_OUTPUT_FILE" ]] && command -v jq &> /dev/null; then
    # Use jq to parse JSON
    jq -r '.packages[] | if .registry == "npm" then "npm install \(.name)@\(.version)" elif .registry == "jsr" then "deno add \(.name)@\(.version)" else "" end' "$SNAPSHOT_OUTPUT_FILE" >> "$PR_COMMENT_FILE"
  else
    # Fallback to extracting from log
    grep -E '^npm install @pgflow/|^deno add @pgflow/' "$SNAPSHOT_LOG" >> "$PR_COMMENT_FILE" || echo "# Check logs for installation commands" >> "$PR_COMMENT_FILE"
  fi

  echo '```' >> "$PR_COMMENT_FILE"
  
  cat >> "$PR_COMMENT_FILE" << EOF

### Testing the Snapshot

1. Update your project dependencies to use the snapshot versions
2. Run your tests to ensure everything works as expected
3. Report any issues in this PR

**Note:** These snapshot versions are temporary and will not be available after this PR is merged.
EOF

  echo ""
  echo -e "${GREEN}Installation instructions written to: ${PR_COMMENT_FILE}${NC}"
  
  # If in GitHub Actions, also output as a comment command
  if [[ "${GITHUB_ACTIONS:-}" == "true" && -n "${PR_NUMBER}" ]]; then
    echo "::notice title=Snapshot Release::Snapshot packages published for PR #${PR_NUMBER}"
  fi
fi

echo -e "\n${GREEN}CI snapshot release complete!${NC}"