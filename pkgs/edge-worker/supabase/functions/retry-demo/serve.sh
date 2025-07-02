#!/bin/bash

# Change to edge-worker directory
cd "$(dirname "$0")/../../.."

echo "Starting retry-demo edge function..."
echo ""

# Start the function with no JWT verification
pnpm exec supabase functions serve retry-demo --env-file supabase/functions/.env --no-verify-jwt