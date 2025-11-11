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
supabase link --project-ref <PROJECT_REF>

# Reset database (applies migrations + seed data)
supabase db reset --linked

# Deploy Edge Functions
supabase functions deploy --project-ref <PROJECT_REF>
```

### 3. Edge Function Secrets

Set environment variables for Edge Functions:

```bash
# Set LLM API key (choose Groq or OpenAI)
supabase secrets set GROQ_API_KEY=your_groq_key_here
# OR
supabase secrets set OPENAI_API_KEY=your_openai_key_here

# Verify secrets are set
supabase secrets list
```

Repeat for both production and preview projects.

### 4. Cloudflare Setup

```bash
# Authenticate with Cloudflare
pnpm wrangler login

# Deploy production (from repo root)
pnpm nx deploy demo

# Deploy preview
pnpm nx deploy:preview demo
```

### 5. GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets):

**Supabase (Production):**
- `SUPABASE_ACCESS_TOKEN` - Personal access token from https://supabase.com/dashboard/account/tokens
- `PRODUCTION_PROJECT_ID` - Production project ref
- `PRODUCTION_DB_PASSWORD` - Production database password

**Supabase (Preview):**
- `PREVIEW_PROJECT_ID` - Preview project ref
- `PREVIEW_DB_PASSWORD` - Preview database password

**Cloudflare:**
- `CLOUDFLARE_API_TOKEN` - API token from Cloudflare dashboard
- `CLOUDFLARE_ACCOUNT_ID` - Account ID from Cloudflare dashboard

### 6. Enable Supabase Branching (Optional)

For automatic per-PR preview databases:

1. Go to Supabase project → Settings → Integrations → GitHub
2. Enable Branching
3. Configure branch triggers (e.g., `feat-demo-*`)

## Deployment URLs

- **Production**: https://demo.pgflow.dev
- **Preview**: https://pr-{number}.pgflow-demo.workers.dev

## Manual Deployments

### Production
```bash
pnpm nx deploy demo
```

### Preview
```bash
# With custom name (using script directly)
cd apps/demo
./scripts/deploy-preview.sh my-feature

# With custom name (using nx)
PREVIEW_NAME=my-feature pnpm nx deploy:preview demo

# With PR number (CI)
PR_NUMBER=123 pnpm nx deploy:preview demo

# Default local preview
pnpm nx deploy:preview demo
```

### Reset Database
```bash
cd apps/demo
supabase link --project-ref <PROJECT_REF>
supabase db reset --linked
```

## Troubleshooting

**Edge Functions failing:**
- Check secrets are set: `supabase secrets list`
- Verify you're linked to correct project: `cat supabase/.branches/_current_branch`

**Database out of sync:**
- Run `supabase db reset --linked` to reapply all migrations

**Cloudflare deployment fails:**
- Ensure you're authenticated: `pnpm wrangler whoami`
- Check wrangler.toml routes match your domain
