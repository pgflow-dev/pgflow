#!/bin/bash

# Script to perform a full release of all packages to npm and JSR
#
# This script:
# 1. Validates that both npm and JSR publishing will work
# 2. Publishes packages to npm
# 3. Publishes edge-worker to JSR

set -e  # Exit immediately if any command fails

# First validate both publishing methods
echo "=== Running validation checks ==="
./scripts/validate-publish.sh

# Ask for confirmation before proceeding
echo ""
echo "The validation checks passed. Ready to publish to npm and JSR."
read -p "Do you want to continue with the actual publishing? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Publishing canceled."
    exit 0
fi

# Publish to npm
echo ""
echo "=== Publishing to npm ==="
pnpm run release

# Publish to JSR
echo ""
echo "=== Publishing to JSR ==="
./scripts/jsr-publish.sh

echo ""
echo "✅ Full release completed successfully!"
echo "  - All packages published to npm"
echo "  - edge-worker published to JSR"