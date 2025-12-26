#!/usr/bin/env bash
set -euo pipefail

# Deploy edge functions to the preview Supabase project

cd "$(dirname "$0")/.."

# Source env
set -a; source .env.preview; set +a

echo "🚀 Deploying edge functions to preview..."
echo "   Project: $SUPABASE_PROJECT_REF"

SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" pnpm supabase functions deploy article_flow_worker --project-ref "$SUPABASE_PROJECT_REF"

echo ""
echo "✅ Edge functions deployed to preview!"
