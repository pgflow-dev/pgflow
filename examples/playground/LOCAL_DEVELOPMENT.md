# Local Development for Edge Functions

This document explains how to use local versions of pgflow packages during development.

## Overview

The pgflow monorepo has a complex package publishing strategy:
- **@pgflow/edge-worker** - Published to JSR as TypeScript source files
- **@pgflow/core** and **@pgflow/dsl** - Published to npm as compiled JavaScript

During local development, we use a vendor directory approach to work with unpublished local versions.

## Quick Start

1. **Start Supabase** (Terminal 1):
   ```bash
   cd examples/playground
   pnpm start-supabase
   ```

2. **Start Edge Functions** (Terminal 2):
   ```bash
   cd examples/playground
   pnpm start-functions
   ```

The `start-functions` command automatically syncs local packages before starting the edge functions.

**Important:** When you make changes to any pgflow packages, you need to restart the edge functions:
- Press `Ctrl+C` to stop the functions
- Run `pnpm start-functions` again to sync and restart

## Manual Sync

To manually sync dependencies:
```bash
pnpm nx sync-edge-deps playground
```

## How It Works

1. The `sync-edge-deps` script:
   - Builds core and dsl packages
   - Copies built outputs to `supabase/functions/_vendor/`
   - Copies edge-worker source to vendor directory

2. The `import_map.json` redirects imports to use local vendor files

3. The `deno.json` references the import map for local development

## Switching to Production Mode

To test with published packages instead of local versions:

1. Rename `deno.json` to `deno.local.json`
2. Rename `deno.prod.json` to `deno.json`
3. Run edge functions normally

## Directory Structure

```
supabase/functions/
├── _vendor/              # Local development dependencies (gitignored)
│   └── @pgflow/
│       ├── core/        # Built files from core package
│       ├── dsl/         # Built files from dsl package
│       └── edge-worker/ # Source files from edge-worker
├── deno.json            # Points to import_map.json for local dev
├── deno.prod.json       # Production configuration (uses registries)
└── import_map.json      # Maps imports to vendor directory
```

## Troubleshooting

### Permission denied
Make sure the sync script is executable:
```bash
chmod +x examples/playground/scripts/sync-edge-deps.sh
```

### Build failures
Ensure all packages build successfully:
```bash
pnpm nx build core
pnpm nx build dsl
```

### Import errors
Check vendor directory structure:
```bash
ls -la examples/playground/supabase/functions/_vendor/@pgflow/
```

### Docker issues
If file changes aren't detected, restart Supabase:
```bash
pnpm stop-supabase
pnpm start-supabase
```