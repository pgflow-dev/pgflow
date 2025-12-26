#!/usr/bin/env bash
set -euo pipefail

# Reset the preview Supabase database using linked mode
# (--linked mode knows about Supabase-managed extensions like pg_cron)

cd "$(dirname "$0")/.."

# Source env
set -a; source .env.preview; set +a

echo "🗑️  Resetting preview database..."
echo "   Project: $SUPABASE_PROJECT_REF"

# Clean up pgmq queues while extension is still intact
# This prevents orphaned tables after db reset drops the extension
echo "🧹 Cleaning up pgmq queues..."
if ! psql "$SUPABASE_DB_URL" -q -c "SELECT pgmq.drop_queue(queue_name) FROM pgmq.list_queues();" 2>/dev/null; then
  echo "   (no queues to clean up or pgmq not available - continuing)"
fi

# Link to the project (uses SUPABASE_ACCESS_TOKEN for auth)
echo "🔗 Linking to project..."
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" pnpm supabase link --project-ref "$SUPABASE_PROJECT_REF"

# Reset using linked mode (respects Supabase-managed extensions)
pnpm supabase db reset --linked --yes

# Set up vault secrets and register worker function
# - Secrets needed for ensure_workers cron to make HTTP calls to edge functions
# - Worker registration so cron knows to keep article_flow_worker alive
echo "🔐 Setting up vault secrets and registering worker..."

# Use psql's -v for safe variable passing (prevents SQL injection)
# ON_ERROR_STOP ensures heredoc errors propagate correctly with set -e
if ! psql "$SUPABASE_DB_URL" -q \
  -v ON_ERROR_STOP=1 \
  -v service_role_key="$SUPABASE_SERVICE_ROLE_KEY" \
  -v project_ref="$SUPABASE_PROJECT_REF" \
  <<'EOSQL'
DELETE FROM vault.secrets WHERE name IN ('supabase_service_role_key', 'supabase_project_id');
SELECT vault.create_secret(:'service_role_key', 'supabase_service_role_key');
SELECT vault.create_secret(:'project_ref', 'supabase_project_id');
SELECT pgflow.track_worker_function('article_flow_worker');
EOSQL
then
  echo "❌ Failed to set up vault secrets and register worker"
  exit 1
fi

echo ""
echo "✅ Preview database reset complete!"
