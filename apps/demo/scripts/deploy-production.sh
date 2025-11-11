#!/bin/bash

# Deploy demo app to production using .env.production file

set -e  # Exit on error
set -u  # Exit on undefined variable

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.production"

# Check if .env.production exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ ERROR: .env.production file not found!"
    echo "   Expected location: $ENV_FILE"
    echo ""
    echo "   Please create the .env.production file with the following required variables:"
    echo "   - VITE_SUPABASE_URL"
    echo "   - VITE_SUPABASE_ANON_KEY"
    echo "   - CLOUDFLARE_API_TOKEN"
    echo "   - CLOUDFLARE_ACCOUNT_ID"
    exit 1
fi

echo "✓ Found .env.production file"
echo "Loading environment variables from .env.production..."
set -a  # Export all variables
source "$ENV_FILE"
set +a

# Validate required environment variables
REQUIRED_VARS=(
    "VITE_SUPABASE_URL"
    "VITE_SUPABASE_ANON_KEY"
    "CLOUDFLARE_API_TOKEN"
    "CLOUDFLARE_ACCOUNT_ID"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ ERROR: Missing required environment variables in .env.production:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    exit 1
fi

# Validate Supabase URL uses https
if [[ ! "$VITE_SUPABASE_URL" =~ ^https:// ]]; then
    echo "❌ ERROR: VITE_SUPABASE_URL must use https:// (not http://)"
    echo "   Current value: $VITE_SUPABASE_URL"
    exit 1
fi

echo "✓ All required environment variables are set"

echo "Building demo app..."
cd "$PROJECT_ROOT/../.." # Go to monorepo root
pnpm nx run demo:build

echo "Deploying to production..."
cd "$PROJECT_ROOT"
wrangler deploy --env production

echo "✅ Deployment complete!"
echo "Your app should be available at https://demo.pgflow.dev"