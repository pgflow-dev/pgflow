#!/bin/bash
# Type Testing Health Check
#
# Verifies that the type testing infrastructure is working correctly by
# running tests on a canary file that MUST fail in expected ways.
#
# This ensures that if type checking breaks, we'll know about it!

set -e

HEALTH_FILE="__tests__/types/__health__.test-d.ts"
TEMP_OUTPUT=$(mktemp)
EXIT_CODE=0

echo "========================================="
echo "Type Testing Infrastructure Health Check"
echo "========================================="
echo ""
echo "Running diagnostics on: $HEALTH_FILE"
echo ""

# Test 1: Verify tsc catches errors in canary file
echo "[1/4] Testing Pass 1: Type error detection..."
pnpm tsc --noEmit "$HEALTH_FILE" 2>&1 | tee "$TEMP_OUTPUT" > /dev/null
if grep -q "error TS" "$TEMP_OUTPUT"; then
  echo "      ✓ tsc detects type errors in health file"
else
  echo "      ✗ FAIL: tsc did not detect errors"
  EXIT_CODE=1
fi
echo ""

# Test 2: Verify expectTypeOf type mismatch detection
echo "[2/4] Testing expectTypeOf type mismatch detection..."
if grep -q "Expected.*Actual" "$TEMP_OUTPUT"; then
  echo "      ✓ expectTypeOf produces clear error messages"
  # Show example
  EXAMPLE_MSG=$(grep -m1 "Expected.*Actual" "$TEMP_OUTPUT" | sed 's/.*\(Expected[^"]*\).*/\1/')
  echo "      Example: $EXAMPLE_MSG"
else
  echo "      ✗ FAIL: expectTypeOf type mismatches not detected clearly"
  EXIT_CODE=1
fi
echo ""

# Test 3: Verify Pass 2 (individual file) catches TS2578
echo "[3/4] Testing Pass 2: Unused @ts-expect-error detection..."
if pnpm tsc --noEmit "$HEALTH_FILE" 2>&1 | grep -q "TS2578"; then
  echo "      ✓ Pass 2 detects unused @ts-expect-error directives"
  # Count how many
  TS2578_COUNT=$(pnpm tsc --noEmit "$HEALTH_FILE" 2>&1 | grep -c "TS2578" || true)
  echo "      Found $TS2578_COUNT unused @ts-expect-error directive(s)"
else
  echo "      ✗ FAIL: TS2578 not detected - @ts-expect-error validation broken"
  EXIT_CODE=1
fi
echo ""

# Test 4: Verify the health file has expected error patterns
echo "[4/4] Testing health file error patterns..."
EXPECTED_PATTERNS=(
  "TS2344"  # Type constraint violations from expectTypeOf
  "TS2578"  # Unused @ts-expect-error directives
)

ALL_ERRORS=$(pnpm tsc --noEmit "$HEALTH_FILE" 2>&1 || true)
for PATTERN in "${EXPECTED_PATTERNS[@]}"; do
  if echo "$ALL_ERRORS" | grep -q "$PATTERN"; then
    echo "      ✓ Found expected error pattern: $PATTERN"
  else
    echo "      ✗ MISSING expected error pattern: $PATTERN"
    EXIT_CODE=1
  fi
done
echo ""

# Cleanup
rm -f "$TEMP_OUTPUT"

# Final verdict
echo "========================================="
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ SUCCESS: Type testing infrastructure is healthy"
  echo ""
  echo "All checks passed:"
  echo "  • Pass 1 (project-wide) catches type errors"
  echo "  • expectTypeOf produces clear error messages"
  echo "  • Pass 2 (individual files) catches TS2578 errors"
  echo "  • Health file exhibits expected error patterns"
  echo ""
  echo "Your type tests are working correctly!"
else
  echo "❌ FAILURE: Type testing infrastructure is BROKEN"
  echo ""
  echo "This means type tests may not be catching bugs!"
  echo "Investigate the failed checks above and fix the testing setup."
  echo ""
  echo "Common issues:"
  echo "  • TypeScript version mismatch"
  echo "  • tsconfig.typecheck.json misconfigured"
  echo "  • typecheck-ts2578.sh script broken"
  echo "  • Vitest expectTypeOf not working"
fi
echo "========================================="

exit $EXIT_CODE
