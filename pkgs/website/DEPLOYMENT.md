# Website Deployment

The pgflow documentation website is deployed to **Cloudflare Pages** via GitHub Actions.

- **Production**: https://www.pgflow.dev
- **Preview**: https://pr-{number}.pgflow.pages.dev

## Required GitHub Secrets

Configure these in repository Settings → Secrets and variables → Actions.

### Cloudflare
- `CLOUDFLARE_API_TOKEN` - API token for Cloudflare Pages deployment
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID

### Supabase

**Preview:**
- `WEBSITE_PREVIEW_SUPABASE_URL` → `VITE_SUPABASE_URL`
- `WEBSITE_PREVIEW_SUPABASE_ANON_KEY` → `VITE_SUPABASE_ANON_KEY`

**Production:**
- `WEBSITE_PRODUCTION_SUPABASE_URL` → `VITE_SUPABASE_URL`
- `WEBSITE_PRODUCTION_SUPABASE_ANON_KEY` → `VITE_SUPABASE_ANON_KEY`

### Analytics
- `WEBSITE_PLAUSIBLE_PROXY_URL` → `PLAUSIBLE_PROXY_URL` (required for production only)
  - Cloudflare Workers proxy URL for Plausible Analytics
  - Example: `https://your-worker.your-username.workers.dev`
  - Proxies requests to avoid ad blockers

### Deployment Environment
- `DEPLOYMENT_ENV` - Set automatically by workflow (`production` or `preview`)
  - Controls robots.txt and validates production requirements
  - Not set for build/test jobs (safe defaults apply)

## Deployment Workflow

The `deploy-website` job in `.github/workflows/ci.yml`:

1. Triggers on push to `main` or PR updates
2. Checks if website is affected (Nx)
3. Sets `DEPLOYMENT_ENV` based on branch
4. Builds with injected environment variables
   - Production: Requires `PLAUSIBLE_PROXY_URL`, enables indexing
   - Preview: Optional `PLAUSIBLE_PROXY_URL`, blocks indexing
5. Deploys to Cloudflare Pages

## Local Development

No environment variables required. Optional overrides:

```bash
# With custom proxy
PLAUSIBLE_PROXY_URL=https://your-worker.your-username.workers.dev pnpm nx dev website

# Test production behavior
DEPLOYMENT_ENV=production PLAUSIBLE_PROXY_URL=https://your-worker.your-username.workers.dev pnpm nx dev website
```

## Troubleshooting

**Analytics not tracking:**
- Verify proxy URL: `curl -I https://your-worker.your-username.workers.dev/assets/script...js`
- Update `WEBSITE_PLAUSIBLE_PROXY_URL` secret if needed
- Redeploy website

**Build errors:**
- `DEPLOYMENT_ENV must be either 'production' or 'preview'` - Invalid value in workflow
- `PLAUSIBLE_PROXY_URL required for production` - Missing `WEBSITE_PLAUSIBLE_PROXY_URL` secret
- Check workflow logs for details
- Verify Cloudflare API token permissions
