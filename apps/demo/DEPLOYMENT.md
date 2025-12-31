# Demo App Deployment Guide

## Prerequisites

- Node.js 20+, pnpm
- Supabase account (Pro Plan for branching)
- Cloudflare account
- Groq or OpenAI API key

## Initial Setup

### 1. Supabase Projects

Create two Supabase projects:

- **Production**: `pgflow-demo-prod`
- **Preview**: `pgflow-demo-preview`

Note the project refs from dashboard URLs: `https://supabase.com/dashboard/project/<project-ref>`

### 2. Database Setup

For each project (production and preview):

```bash
cd apps/demo

# Link to project
pnpm supabase link --project-ref <PROJECT_REF>

# Reset database (applies migrations + seed data)
pnpm supabase db reset
```

### 3. Setting Up Vault Secrets

After database migrations, set up vault secrets for worker management:

```bash
# From apps/demo, source the appropriate env file
set -a; source .env.production  # or .env.preview
set +a

# Set up vault secrets and register worker
psql "$SUPABASE_DB_URL" \
  -v service_role_key="$SUPABASE_SERVICE_ROLE_KEY" \
  -v project_ref="$SUPABASE_PROJECT_REF" <<'EOSQL'
DELETE FROM vault.secrets WHERE name IN ('supabase_service_role_key', 'supabase_project_id');
SELECT vault.create_secret(:'service_role_key', 'supabase_service_role_key');
SELECT vault.create_secret(:'project_ref', 'supabase_project_id');
SELECT pgflow.track_worker_function('article_flow_worker');
EOSQL
```

### 4. Edge Function Secrets

Set environment variables for Edge Functions:

```bash
# Set LLM API key (choose Groq or OpenAI)
pnpm supabase secrets set GROQ_API_KEY=your_groq_key_here
# OR
pnpm supabase secrets set OPENAI_API_KEY=your_openai_key_here

# Verify secrets are set
pnpm supabase secrets list
```

Repeat for both production and preview projects.

### 5. Deploy Edge Functions

```bash
cd apps/demo

# For production
set -a; source .env.production; set +a
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" pnpm supabase functions deploy article_flow_worker --project-ref "$SUPABASE_PROJECT_REF"

# For preview
pnpm nx run demo:deploy:preview:functions
```

### 6. Cloudflare Setup

```bash
# Authenticate with Cloudflare
pnpm wrangler login

# Deploy production webapp (from repo root)
cd apps/demo
pnpm wrangler deploy

# Deploy preview
pnpm nx run demo:deploy:preview:webapp
```

### 7. GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets):

**Supabase (Production):**

- `DEMO_PRODUCTION_SUPABASE_URL` - Production project URL
- `DEMO_PRODUCTION_SUPABASE_ANON_KEY` - Production anon key
- `DEMO_PRODUCTION_SUPABASE_PROJECT_REF` - Production project ref
- `DEMO_PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` - Production service role key
- `DEMO_PRODUCTION_SUPABASE_DB_URL` - Production database connection string
- `DEMO_PRODUCTION_SUPABASE_ACCESS_TOKEN` - Supabase personal access token

**Supabase (Preview):**

- `DEMO_PREVIEW_SUPABASE_URL` - Preview project URL
- `DEMO_PREVIEW_SUPABASE_ANON_KEY` - Preview anon key
- `DEMO_PREVIEW_SUPABASE_PROJECT_REF` - Preview project ref
- `DEMO_PREVIEW_SUPABASE_SERVICE_ROLE_KEY` - Preview service role key
- `DEMO_PREVIEW_SUPABASE_DB_URL` - Preview database connection string
- `DEMO_PREVIEW_SUPABASE_ACCESS_TOKEN` - Supabase personal access token

**Cloudflare:**

- `CLOUDFLARE_API_TOKEN` - API token from Cloudflare dashboard
- `CLOUDFLARE_ACCOUNT_ID` - Account ID from Cloudflare dashboard

### 8. Enable Supabase Branching (Optional)

For automatic per-PR preview databases:

1. Go to Supabase project → Settings → Integrations → GitHub
2. Enable Branching
3. Configure branch triggers (e.g., `feat-demo-*`)

## Deployment URLs

- **Production**: https://demo.pgflow.dev
- **Preview**: https://pr-{number}-pgflow-demo.jumski.workers.dev

## Manual Deployments

### Production

```bash
# Full production deployment
pnpm nx run demo:deploy

# Or step-by-step from apps/demo:
cd apps/demo
pnpm wrangler deploy
```

### Preview

```bash
# Full preview deployment (db + functions + webapp)
pnpm nx run demo:deploy:preview

# With custom name (using script directly)
cd apps/demo
PREVIEW_NAME=my-feature ./scripts/deploy-preview.sh

# With PR number (CI)
PR_NUMBER=123 pnpm nx run demo:deploy:preview

# Default local preview
pnpm nx run demo:deploy:preview
```

### Reset Database

```bash
cd apps/demo
pnpm supabase link --project-ref <PROJECT_REF>
pnpm supabase db reset
```

## Updating Production Deployments

When updating production with new pgflow migrations, apply them selectively in order:

```bash
cd apps/demo

# Link to production
set -a; source .env.production; set +a
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" pnpm supabase link --project-ref "$SUPABASE_PROJECT_REF"

# Apply pgflow migrations in order
pnpm supabase migration up --file 20251226231000_20251104080523_pgflow_upgrade_pgmq_1_5_1.sql
pnpm supabase migration up --file 20251226232000_20251130000000_pgflow_auto_compilation.sql
pnpm supabase migration up --file 20251226233000_20251209074533_pgflow_worker_management.sql

# Set up vault secrets (worker_management adds track_worker_function)
psql "$SUPABASE_DB_URL" \
  -v service_role_key="$SUPABASE_SERVICE_ROLE_KEY" \
  -v project_ref="$SUPABASE_PROJECT_REF" <<'EOSQL'
DELETE FROM vault.secrets WHERE name IN ('supabase_service_role_key', 'supabase_project_id');
SELECT vault.create_secret(:'service_role_key', 'supabase_service_role_key');
SELECT vault.create_secret(:'project_ref', 'supabase_project_id');
SELECT pgflow.track_worker_function('article_flow_worker');
EOSQL

# Deploy edge functions
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" pnpm supabase functions deploy article_flow_worker --project-ref "$SUPABASE_PROJECT_REF"

# Apply remaining migrations
pnpm supabase migration up --file 20251230202447_20251225163110_pgflow_add_flow_input_column.sql

# Deploy webapp
pnpm wrangler deploy
```

## Troubleshooting

**Edge Functions failing:**

- Check secrets are set: `pnpm supabase secrets list`
- Verify you're linked to correct project: `cat supabase/.branches/_current_branch`
- Ensure GROQ_API_KEY or OPENAI_API_KEY is set

**Database out of sync:**

- Run `pnpm supabase db reset` to reapply all migrations
- For production, use selective migration process above

**Worker not auto-restarting:**

- Verify vault secrets are set: `SELECT * FROM vault.secrets;`
- Check worker is tracked: `SELECT * FROM pgflow.worker_functions;`

**Cloudflare deployment fails:**

- Ensure you're authenticated: `pnpm wrangler whoami`
- Check wrangler.toml routes match your domain
- For production, use `pnpm wrangler deploy` (no --env flag)
