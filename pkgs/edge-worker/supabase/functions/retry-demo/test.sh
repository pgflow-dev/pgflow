#!/bin/bash

echo "=== Exponential Backoff Retry Demo ==="
echo ""

# Get DB URL from nx status
DB_URL=$(pnpm nx supabase:status edge-worker | grep "DB URL" | awk '{print $NF}')

if [ -z "$DB_URL" ]; then
  echo "Error: Could not get DB URL. Make sure Supabase is running."
  exit 1
fi

# Setup and send test message
psql "$DB_URL" << 'EOF'
-- Create queue if not exists
SELECT pgmq.create_non_partitioned('retry-demo');

-- Clear any existing messages
SELECT pgmq.purge_queue('retry-demo');

-- Send test message
SELECT pgmq.send('retry-demo', '{"test": "exponential backoff demo"}'::jsonb);
EOF

echo ""
echo "Test message sent!"
echo ""
echo "Start the function with:"
echo "  supabase functions serve retry-demo --no-verify-jwt"
echo ""
echo "Then trigger it with:"
echo "  curl -X POST http://localhost:50321/functions/v1/retry-demo"
echo ""
echo "Expected behavior:"
echo "  Attempt 1: Immediate fail"
echo "  Attempt 2: After ~2 seconds (2s base delay)"
echo "  Attempt 3: After ~4 seconds (2s × 2¹)"
echo "  Attempt 4: After ~8 seconds (2s × 2²) - SUCCESS"
echo ""

# Optionally trigger the function automatically
read -p "Trigger the function now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Triggering function..."
  curl -X POST http://localhost:50321/functions/v1/retry-demo
fi
