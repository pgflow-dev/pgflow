#!/usr/bin/env bash
set -e

# Script to deploy a preview version of the demo app
# Uses preview alias for deterministic URLs
# Assumes build is already done (via Nx dependsOn)
# Usage: pnpm nx run demo:deploy:preview -- [preview-name]

PREVIEW_NAME="${1:-preview}"

echo "🚀 Deploying preview: $PREVIEW_NAME"

# Navigate to demo directory if not already there
cd "$(dirname "$0")/.."

echo "🌐 Deploying to Cloudflare Workers..."
wrangler versions upload --preview-alias "${PREVIEW_NAME}"

echo ""
echo "✅ Preview deployed successfully!"
echo "🔗 Preview alias URL should be available at:"
echo "   https://${PREVIEW_NAME}-pgflow-demo.jumski.workers.dev"
echo ""
echo "💡 If the URL doesn't work, check:"
echo "   - Preview URLs are enabled in dashboard (Settings > Domains & Routes)"
echo "   - Worker name in wrangler.toml matches 'pgflow-demo'"
