# Playground Deployment Guide

This document explains the deployment setup for the pgflow playground example, including important caveats and requirements for CI/CD.

## Overview

The playground is a Next.js application deployed to Netlify. It demonstrates pgflow features using Supabase Edge Functions and requires careful coordination between build and deployment steps.

## Key Configuration Files

### 1. `project.json` - Nx Configuration

The playground uses specific output paths that may seem unusual but are required for Next.js + Netlify:

```json
{
  "build": {
    "executor": "@nx/next:build",
    "outputs": ["{projectRoot}/.next"],
    "options": {
      "outputPath": "{projectRoot}"  // ⚠️ This is correct - do not change!
    }
  }
}
```

**Why `outputPath: {projectRoot}`?**
- Next.js builds into `.next` folder within the project root
- Netlify needs access to the entire project structure (including `package.json`, `next.config.js`)
- The Netlify Next.js plugin expects standard Next.js directory layout
- Changing this breaks the deployment

### 2. `netlify.toml` - Netlify Configuration

```toml
[build]
  base    = "examples/playground"
  command = "pnpm build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

**Important Notes:**
- `base` must point to the playground directory
- `publish` is `.next` (not `dist` or other paths)
- The Next.js plugin handles serverless function generation

## CI/CD Requirements

### 1. Build Dependencies First

The playground imports from workspace packages (`@pgflow/client`, `@pgflow/dsl`). These MUST be built before the playground:

```yaml
# Build dependencies first
- run: pnpm nx run-many -t build --projects client,dsl --configuration=production

# Then deploy playground
- run: pnpm netlify deploy --build --filter=playground
```

### 2. Environment Variables

Different environments require different Supabase configurations:

**Preview Deployments (PRs):**
```yaml
NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.DEMO_PREVIEW_SUPABASE_URL }}
NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.DEMO_PREVIEW_SUPABASE_ANON_KEY }}
```

**Production Deployments:**
```yaml
NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.DEMO_PRODUCTION_SUPABASE_URL }}
NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.DEMO_PRODUCTION_SUPABASE_ANON_KEY }}
```

### 3. Netlify CLI Authentication

Required secrets:
- `NETLIFY_AUTH_TOKEN` - Personal access token from Netlify
- `NETLIFY_SITE_ID` - The site's unique identifier

### 4. Deployment Commands

**Preview Deployment:**
```bash
pnpm netlify deploy --build --filter=playground \
  --context deploy-preview \
  --alias=pr-${{ github.event.pull_request.number }}
```

**Production Deployment:**
```bash
pnpm netlify deploy --build --filter=playground \
  --context production \
  --prod
```

## Common Issues and Solutions

### Issue: "Cannot find module @pgflow/client"

**Cause:** Dependencies not built before playground deployment

**Solution:** Always build `client` and `dsl` packages first:
```bash
pnpm nx run-many -t build --projects client,dsl
```

### Issue: Netlify can't find Next.js app

**Cause:** Incorrect `outputPath` in project.json

**Solution:** Keep `outputPath: "{projectRoot}"` - do not change to `dist/` or other paths

### Issue: Preview URLs not working

**Cause:** Incorrect alias format

**Solution:** Use predictable aliases like `pr-123`:
- Preview URL format: `https://pr-123--pgflow-demo.netlify.app`
- Site name is `pgflow-demo`, not the site ID

### Issue: Environment variables not available in build

**Cause:** Variables set in CI but not passed to Netlify build

**Solution:** Either:
1. Set them in Netlify UI (recommended for secrets)
2. Pass them explicitly in the deploy command
3. Use Netlify's environment variable UI for different contexts

## Local Testing

To test the deployment process locally:

```bash
# 1. Build dependencies
pnpm nx run-many -t build --projects client,dsl

# 2. Build playground
pnpm nx build playground

# 3. Test Netlify build (requires Netlify CLI)
cd examples/playground
netlify build

# 4. Preview locally
netlify dev
```

## Deployment Flow

1. **CI triggers** on PR or push to main
2. **Build job** runs tests and builds all affected projects
3. **Deploy job** checks out code, rebuilds dependencies, and deploys
4. **PR comment** posts deployment status with preview URL

## Important Caveats

1. **Do NOT cache node_modules between build and deploy jobs** - The deploy job needs to rebuild to ensure proper module resolution

2. **Always use `--filter=playground`** with Netlify CLI to ensure it runs from the correct directory

3. **The `--build` flag is intentional** - It ensures Netlify runs its build process with proper context

4. **Nx Cloud caching helps** but doesn't replace the need to rebuild in deploy job

5. **Environment variables must be set before build** - Next.js bakes them in at build time

## Future Improvements

- Consider using Nx artifacts to pass built packages between jobs
- Implement deployment status checks
- Add rollback capabilities
- Extract deployment URL from Netlify CLI output for accurate PR comments