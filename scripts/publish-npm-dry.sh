#!/bin/bash

# Script to perform a dry-run of npm package publishing
#
# This performs a dry-run of the npm publishing process to ensure it will work
# without actually publishing any packages

echo "=== Validating npm publishing (dry run) ==="
pnpm nx run-many -t build
pnpm publish --recursive --dry-run

RESULT=$?
if [ $RESULT -eq 0 ]; then
  echo "✅ Dry run successful - packages are ready to be published to npm"
else
  echo "❌ Dry run failed - packages are not ready to be published to npm"
  exit $RESULT
fi