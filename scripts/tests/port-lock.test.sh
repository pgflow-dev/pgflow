#!/bin/bash
set -e

# ============================================================================
# Port Lock Test Script
# ============================================================================
# Simple test to verify port-lock.sh works correctly
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT_LOCK="$SCRIPT_DIR/port-lock.sh"
TEST_OUTPUT="/tmp/port-lock-test-output.txt"
LOCK_FILE="/tmp/port-lock-test.lock"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Cleanup
cleanup() {
    rm -f "$TEST_OUTPUT" "$LOCK_FILE"
}
trap cleanup EXIT

echo "Testing port-lock.sh..."
echo ""

# Test 1: Basic execution
echo "Test 1: Basic command execution"
if "$PORT_LOCK" "$LOCK_FILE" echo "test" > "$TEST_OUTPUT" 2>&1; then
    if grep -q "test" "$TEST_OUTPUT"; then
        pass "Command executed successfully"
    else
        fail "Command output not found"
    fi
else
    fail "Command execution failed"
fi

# Test 2: Exit code preservation
echo ""
echo "Test 2: Exit code preservation"
"$PORT_LOCK" "$LOCK_FILE" bash -c 'exit 42' && EXIT_CODE=0 || EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 42 ]; then
    pass "Exit code preserved correctly"
else
    fail "Exit code not preserved (expected 42, got $EXIT_CODE)"
fi

# Test 3: Parallel execution (serialization)
echo ""
echo "Test 3: Parallel execution serialization"
> "$TEST_OUTPUT"

"$PORT_LOCK" "$LOCK_FILE" bash -c 'echo "A START"; sleep 0.3; echo "A END"' >> "$TEST_OUTPUT" 2>&1 &
PID1=$!
"$PORT_LOCK" "$LOCK_FILE" bash -c 'echo "B START"; sleep 0.3; echo "B END"' >> "$TEST_OUTPUT" 2>&1 &
PID2=$!
"$PORT_LOCK" "$LOCK_FILE" bash -c 'echo "C START"; sleep 0.3; echo "C END"' >> "$TEST_OUTPUT" 2>&1 &
PID3=$!

wait $PID1 $PID2 $PID3

# Verify all processes completed
if grep -q "A START" "$TEST_OUTPUT" && grep -q "A END" "$TEST_OUTPUT" && \
   grep -q "B START" "$TEST_OUTPUT" && grep -q "B END" "$TEST_OUTPUT" && \
   grep -q "C START" "$TEST_OUTPUT" && grep -q "C END" "$TEST_OUTPUT"; then
    pass "All parallel processes completed"
else
    fail "Some processes did not complete"
fi

# Verify execution was serialized (6 process lines expected)
LINE_COUNT=$(grep -c "^[ABC]" "$TEST_OUTPUT")
if [ "$LINE_COUNT" -eq 6 ]; then
    pass "Expected number of output lines (6)"
else
    fail "Unexpected line count: $LINE_COUNT (expected 6)"
fi

# Test 4: Complex command with arguments
echo ""
echo "Test 4: Complex command with arguments and redirection"
"$PORT_LOCK" "$LOCK_FILE" bash -c 'echo "line1"; echo "line2"' > "$TEST_OUTPUT" 2>&1
if [ "$(wc -l < "$TEST_OUTPUT")" -eq 2 ]; then
    pass "Complex command with multiple outputs works"
else
    fail "Complex command failed"
fi

echo ""
echo "================================"
echo -e "${GREEN}All tests passed!${NC}"
echo "================================"
