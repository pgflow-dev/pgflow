#!/bin/bash

# Script to validate both NPM and JSR publishing
#
# This script performs dry-run checks for both:
# 1. npm publishing via pnpm
# 2. JSR publishing for edge-worker

set -e  # Exit immediately if any command fails

echo "=== Validating npm publishing ==="
pnpm nx run-many -t build
pnpm publish --recursive --dry-run

echo ""
echo "=== Validating JSR publishing for edge-worker ==="
./scripts/jsr-publish.sh --dry

echo ""
echo "✅ All validation checks passed!"
echo "You can safely run the following commands to publish:"
echo "  1. pnpm run release       # Publish to npm"
echo "  2. pnpm run publish:jsr   # Publish to JSR"