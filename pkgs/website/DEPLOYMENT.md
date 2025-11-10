# Website Deployment

This document describes the deployment configuration for the pgflow documentation website.

## Deployment Target

The website is deployed to **Cloudflare Pages** via GitHub Actions workflow.

- **Production URL**: https://www.pgflow.dev
- **Preview URLs**: https://pr-{number}.pgflow.pages.dev (for pull requests)

## Required GitHub Secrets

The following secrets must be configured in the GitHub repository (Settings → Secrets and variables → Actions).

**Note**: Some secrets are namespaced (e.g., `WEBSITE_*`) at the GitHub level but are mapped to simpler names (e.g., `VITE_*`, `PLAUSIBLE_PROXY_URL`) when passed as environment variables to the build process.

### Cloudflare Configuration

- **`CLOUDFLARE_API_TOKEN`**
  - **GitHub Secret Name**: `CLOUDFLARE_API_TOKEN`
  - **Environment variable**: `CLOUDFLARE_API_TOKEN`
  - API token for deploying to Cloudflare Pages

- **`CLOUDFLARE_ACCOUNT_ID`**
  - **GitHub Secret Name**: `CLOUDFLARE_ACCOUNT_ID`
  - **Environment variable**: `CLOUDFLARE_ACCOUNT_ID`
  - Cloudflare account ID

### Supabase Configuration

Website deployment requires Supabase configuration for both preview and production environments:

**Preview Environment:**
- **`WEBSITE_PREVIEW_SUPABASE_URL`**
  - **GitHub Secret Name**: `WEBSITE_PREVIEW_SUPABASE_URL`
  - **Maps to environment variable**: `VITE_SUPABASE_URL` (in preview deployments)
  - Supabase project URL for preview deployments

- **`WEBSITE_PREVIEW_SUPABASE_ANON_KEY`**
  - **GitHub Secret Name**: `WEBSITE_PREVIEW_SUPABASE_ANON_KEY`
  - **Maps to environment variable**: `VITE_SUPABASE_ANON_KEY` (in preview deployments)
  - Supabase anonymous key for preview deployments

**Production Environment:**
- **`WEBSITE_PRODUCTION_SUPABASE_URL`**
  - **GitHub Secret Name**: `WEBSITE_PRODUCTION_SUPABASE_URL`
  - **Maps to environment variable**: `VITE_SUPABASE_URL` (in production deployments)
  - Supabase project URL for production

- **`WEBSITE_PRODUCTION_SUPABASE_ANON_KEY`**
  - **GitHub Secret Name**: `WEBSITE_PRODUCTION_SUPABASE_ANON_KEY`
  - **Maps to environment variable**: `VITE_SUPABASE_ANON_KEY` (in production deployments)
  - Supabase anonymous key for production

### Analytics Configuration

- **`WEBSITE_PLAUSIBLE_PROXY_URL`** - Cloudflare Workers proxy URL for Plausible Analytics (website-specific)
  - **GitHub Secret Name**: `WEBSITE_PLAUSIBLE_PROXY_URL`
  - **Maps to environment variable**: `PLAUSIBLE_PROXY_URL` (used in `astro.config.mjs`)
  - Example value: `https://your-worker-name.your-username.workers.dev`
  - This proxies requests to Plausible to avoid ad blockers
  - If this URL becomes invalid, Plausible tracking will stop working
  - Note: This is separate from demo app analytics which uses its own proxy URL

## Deployment Workflow

The deployment is handled by the `deploy-website` job in `.github/workflows/ci.yml`:

1. **Trigger**: Runs on push to `main` or when a pull request is opened/updated
2. **Affected Check**: Only deploys if the website package is affected by changes (using Nx)
3. **Build**: Builds the website with environment variables injected
4. **Deploy**:
   - Production: Deploys to main branch on Cloudflare Pages
   - Preview: Deploys to PR-specific branch on Cloudflare Pages

## Local Development

For local development, the Plausible proxy URL falls back to a hardcoded value in `astro.config.mjs` if the `PLAUSIBLE_PROXY_URL` environment variable is not set.

To test with a specific proxy URL locally:

```bash
PLAUSIBLE_PROXY_URL=https://your-worker.your-username.workers.dev pnpm nx dev website
```

## Troubleshooting

### Plausible Analytics Not Tracking

If Plausible stops tracking visitors:

1. Check if the Cloudflare Workers proxy URL is accessible:
   ```bash
   curl -I https://your-worker-name.your-username.workers.dev/assets/script.hash.outbound-links.pageview-props.tagged-events.js
   ```

2. If the URL fails (DNS resolution error or 404), update the `WEBSITE_PLAUSIBLE_PROXY_URL` secret in GitHub with the correct URL

3. The proxy URL may change if the Cloudflare Workers username changes

4. After updating the secret, redeploy the website (push to `main` or re-run the workflow)

### Deployment Fails

- Verify all required secrets are configured in GitHub
- Check the GitHub Actions workflow logs for specific error messages
- Ensure the Cloudflare API token has the necessary permissions (Account → Cloudflare Pages - Edit)
