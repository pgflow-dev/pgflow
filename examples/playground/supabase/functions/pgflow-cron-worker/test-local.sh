#!/bin/bash

# Test the cron worker locally
# Usage: ./test-local.sh

echo "Testing pgflow-cron-worker locally..."

# Get the function URL (assumes local Supabase is running)
FUNCTION_URL="http://localhost:54321/functions/v1/pgflow-cron-worker"

# Get the anon key from environment or use default local key
ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"

# Test payload
PAYLOAD='{
  "flow_slug": "analyze_website",
  "batch_size": 5,
  "max_concurrent": 3
}'

echo "Sending request to: $FUNCTION_URL"
echo "Payload: $PAYLOAD"
echo ""

# Make the request
curl -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n"