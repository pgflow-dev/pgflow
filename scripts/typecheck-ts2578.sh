#!/bin/bash
# TS2578 validation - checks for unused @ts-expect-error directives
#
# This script validates that @ts-expect-error directives are actually
# suppressing TypeScript errors. If they're unused, it means the type
# constraint they were testing has become too permissive.
#
# Usage:
#   typecheck-ts2578.sh                    # Check all *.test-d.ts files
#   typecheck-ts2578.sh path/to/file.ts    # Check specific file
#   typecheck-ts2578.sh path/to/dir/       # Check all *.test-d.ts in directory

set +e  # Don't exit on first error, collect all errors

EXIT_CODE=0
ERRORS_FILE=$(mktemp)
TARGET_PATH="${1:-.}"  # Use first argument or current directory

echo "========================================="
echo "TS2578 Validation (@ts-expect-error)"
echo "========================================="
echo "Checking for unused @ts-expect-error directives..."
echo "(This catches when type constraints become too permissive)"
echo ""

FILE_ERRORS=0

# Determine which files to check
if [ -f "$TARGET_PATH" ]; then
  # Single file provided
  echo "Targeting specific file: $TARGET_PATH"
  FILES_TO_CHECK="$TARGET_PATH"
elif [ -d "$TARGET_PATH" ]; then
  # Directory provided - find all test-d.ts files (excluding __health__.test-d.ts)
  echo "Targeting directory: $TARGET_PATH"
  FILES_TO_CHECK=$(find "$TARGET_PATH" -name "*.test-d.ts" -type f ! -name "__health__.test-d.ts")
else
  echo "Error: '$TARGET_PATH' is not a valid file or directory"
  exit 1
fi

# Check each file
while IFS= read -r file; do
  [ -z "$file" ] && continue  # Skip empty lines
  echo "Checking: $file"

  # Run tsc directly on the file without --project flag
  # This allows TS2578 errors (unused @ts-expect-error) to be detected
  # Use --strict to enable strictNullChecks and other strict mode features
  OUTPUT=$(pnpm tsc --noEmit --strict "$file" 2>&1)
  TSC_EXIT=$?

  if [ $TSC_EXIT -ne 0 ]; then
    # Only check for TS2578 errors (unused @ts-expect-error directives)
    # Other errors are caught by vitest typecheck
    FILTERED=$(echo "$OUTPUT" | grep "TS2578")

    if [ -n "$FILTERED" ]; then
      echo "$FILTERED" | tee -a "$ERRORS_FILE"
      FILE_ERRORS=$((FILE_ERRORS + 1))
      EXIT_CODE=1
      echo ""
    fi
  fi
done <<< "$FILES_TO_CHECK"

echo ""
if [ $FILE_ERRORS -eq 0 ]; then
  echo "✅ All @ts-expect-error directives are valid"
  echo ""
  echo "This means:"
  echo "  • Type constraints are working correctly"
  echo "  • Invalid code is being properly rejected"
  echo "  • No @ts-expect-error directives have become unused"
else
  echo "❌ Found $FILE_ERRORS file(s) with unused @ts-expect-error directives"
  echo ""
  echo "This means:"
  echo "  • Type constraints have become too permissive"
  echo "  • Code that should fail type checking now passes"
  echo "  • Type validation is broken - fix the type signatures!"
  echo ""
  echo "Errors found:"
  cat "$ERRORS_FILE"
fi

rm -f "$ERRORS_FILE"
exit $EXIT_CODE
