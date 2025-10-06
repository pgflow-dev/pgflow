#!/bin/bash
# Two-pass TypeScript type checking
# Pass 1: Project-wide type check
# Pass 2: Individual file checks to catch unused @ts-expect-error directives
#
# Usage:
#   typecheck-strict.sh                    # Check all *.test-d.ts files
#   typecheck-strict.sh path/to/file.ts    # Check specific file
#   typecheck-strict.sh path/to/dir/       # Check all *.test-d.ts in directory

set +e  # Don't exit on first error, collect all errors

EXIT_CODE=0
ERRORS_FILE=$(mktemp)
TARGET_PATH="${1:-.}"  # Use first argument or current directory

echo "========================================="
echo "Pass 1: Project-wide type check"
echo "========================================="
pnpm tsc --project tsconfig.typecheck.json --noEmit 2>&1 | tee -a "$ERRORS_FILE"
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  EXIT_CODE=1
  echo "❌ Project-wide type check failed"
else
  echo "✓ Project-wide type check passed"
fi
echo ""

echo "========================================="
echo "Pass 2: Individual file strict checks"
echo "========================================="
echo "Checking for unused @ts-expect-error directives..."
echo ""

FILE_ERRORS=0

# Determine which files to check
if [ -f "$TARGET_PATH" ]; then
  # Single file provided
  echo "Targeting specific file: $TARGET_PATH"
  FILES_TO_CHECK="$TARGET_PATH"
elif [ -d "$TARGET_PATH" ]; then
  # Directory provided - find all test-d.ts files
  echo "Targeting directory: $TARGET_PATH"
  FILES_TO_CHECK=$(find "$TARGET_PATH" -name "*.test-d.ts" -type f)
else
  echo "Error: '$TARGET_PATH' is not a valid file or directory"
  exit 1
fi

# Check each file
while IFS= read -r file; do
  [ -z "$file" ] && continue  # Skip empty lines
  echo "Checking: $file"

  # Create temporary tsconfig in current directory that extends the main one
  TEMP_CONFIG=".tsconfig.typecheck-strict-$(basename "$file").json"
  cat > "$TEMP_CONFIG" <<EOF
{
  "extends": "./tsconfig.typecheck.json",
  "include": ["$file"]
}
EOF

  OUTPUT=$(pnpm tsc --project "$TEMP_CONFIG" --noEmit 2>&1)
  TSC_EXIT=$?
  rm -f "$TEMP_CONFIG"

  if [ $TSC_EXIT -ne 0 ]; then
    # Filter out node_modules errors, keep only test file errors
    FILTERED=$(echo "$OUTPUT" | grep -v "node_modules")

    if [ -n "$FILTERED" ]; then
      echo "$FILTERED" | tee -a "$ERRORS_FILE"
      FILE_ERRORS=$((FILE_ERRORS + 1))
      EXIT_CODE=1
      echo ""
    fi
  fi
done <<< "$FILES_TO_CHECK"

if [ $FILE_ERRORS -eq 0 ]; then
  echo "✓ All individual file checks passed"
else
  echo "❌ $FILE_ERRORS file(s) had type errors"
fi
echo ""

echo "========================================="
echo "Summary"
echo "========================================="
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All type checks passed!"
else
  echo "❌ Type checking failed"
  echo ""
  echo "Errors found:"
  cat "$ERRORS_FILE"
fi

rm -f "$ERRORS_FILE"
exit $EXIT_CODE
