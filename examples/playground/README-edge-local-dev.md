# Edge Worker Local Development Guide

This guide explains how to use local development versions of pgflow packages in Supabase Edge Functions.

## Quick Start

1. **Sync local packages to vendor directory:**
   ```bash
   pnpm nx sync-edge-deps playground
   ```

2. **Start the file watcher (optional, for auto-sync):**
   ```bash
   pnpm nx watch-edge-deps playground
   ```

3. **Start edge functions with local packages:**
   ```bash
   pnpm nx start-functions:local playground
   ```

## How It Works

The `sync-edge-deps` script:
1. Builds `@pgflow/core` and `@pgflow/dsl` packages
2. Copies built outputs to `supabase/functions/_vendor/`
3. Copies `@pgflow/edge-worker` source files (TypeScript)
4. Backs up production `deno.json` to `deno.production.json`
5. Updates `deno.json` with local vendor imports

## Switching Between Local and Published Packages

- **Use local packages**: `pnpm nx sync-edge-deps playground`
- **Use published packages**: `pnpm nx restore-production-deps playground`

## Troubleshooting

If edge functions aren't picking up changes:
1. Check that vendor directory exists
2. Verify `deno.json` points to local files
3. Restart the edge functions server
4. Run `pnpm nx sync-edge-deps playground` manually

## Files Created/Modified

- `supabase/functions/_vendor/` - Local package copies (gitignored)
- `supabase/functions/deno.json` - Modified with local imports
- `supabase/functions/deno.production.json` - Backup of production config (gitignored)

For more details, see `edge-worker-local-development-issue.md`