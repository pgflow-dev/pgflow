#!/bin/bash

# Script to test channel stabilization delay reliability
# Usage: ./test-stability.sh <number_of_iterations> [delay_ms]

iterations=${1:-10}
delay_ms=${2:-"current"}

if [ "$delay_ms" != "current" ]; then
  echo "Note: To change delay, you need to manually edit vitest.global-setup.ts"
  echo "This script will test with the current delay setting"
fi

echo "Testing channel stabilization with $iterations iterations"
echo "Current delay: Check vitest.global-setup.ts for actual value"
echo "================================================"

success_count=0
fail_count=0

for i in $(seq 1 $iterations); do
  echo -n "Run $i/$iterations: "

  # Run test and capture output
  output=$(pnpm vitest run __tests__/dummy.test.ts 2>&1)

  # Check if test passed
  if echo "$output" | grep -q "Test Files  1 passed"; then
    echo "✓ PASS"
    success_count=$((success_count + 1))
  else
    echo "✗ FAIL"
    fail_count=$((fail_count + 1))

    # Show error if failed
    if echo "$output" | grep -q "Supabase check failed"; then
      error_msg=$(echo "$output" | grep "Supabase check failed" | head -1)
      echo "  Error: $error_msg"
    fi
  fi
done

echo "================================================"
echo "Results:"
echo "  Success: $success_count/$iterations ($(( success_count * 100 / iterations ))%)"
echo "  Failed:  $fail_count/$iterations ($(( fail_count * 100 / iterations ))%)"

# Exit with non-zero if any failures
if [ $fail_count -gt 0 ]; then
  exit 1
fi