#!/usr/bin/env bash
set -euo pipefail

# Deploy preview to Cloudflare Workers
# Assumes build is already done (via Nx dependsOn)
# Usage: ./deploy-preview.sh [preview-name]

PREVIEW_NAME="${1:-preview}"

cd "$(dirname "$0")/.."

echo "🚀 Deploying preview: $PREVIEW_NAME"
wrangler versions upload --preview-alias "${PREVIEW_NAME}"

echo ""
echo "✅ Preview deployed!"
echo "🔗 https://${PREVIEW_NAME}-pgflow-demo.jumski.workers.dev"
