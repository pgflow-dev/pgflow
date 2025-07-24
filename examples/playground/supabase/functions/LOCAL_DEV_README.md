# Edge Functions Local Development Guide

## Quick Start

To use local pgflow packages during development:

```bash
# Terminal 1: Start Supabase
pnpm start-supabase

# Terminal 2: Start Edge Functions (automatically syncs local packages)
pnpm start-functions
```

Your edge functions will now use local versions of `@pgflow/core`, `@pgflow/dsl`, and `@pgflow/edge-worker`.

**Note:** When you make changes to any pgflow packages, restart the edge functions (`Ctrl+C` and run `pnpm start-functions` again) to sync the latest changes.

## Why This Setup?

The pgflow monorepo has a unique challenge:

1. **@pgflow/edge-worker** is published to JSR (JavaScript Registry) as TypeScript source
2. **@pgflow/core** and **@pgflow/dsl** are published to npm as compiled JavaScript
3. Edge Functions run in Docker containers that can't access files outside `supabase/functions/`

During development, we need to use unpublished local versions of these packages, which requires copying them into the Edge Functions directory.

## How It Works

### Import Mapping

The `deno.json` file uses an import map to redirect package imports:

```json
{
  "importMap": "./import_map.json"
}
```

The `import_map.json` file maps package names to local vendor paths:

```json
{
  "imports": {
    "@pgflow/core": "./_vendor/@pgflow/core/index.js",
    "@pgflow/dsl": "./_vendor/@pgflow/dsl/index.js",
    "@pgflow/edge-worker": "./_vendor/@pgflow/edge-worker/index.ts"
  }
}
```

### Vendor Directory

The sync script copies packages into `_vendor/`:

```
_vendor/
├── @pgflow/
│   ├── core/        # Compiled JavaScript from pkgs/core/dist
│   ├── dsl/         # Compiled JavaScript from pkgs/dsl/dist
│   └── edge-worker/ # TypeScript source from pkgs/edge-worker/src
```

### Import Extension Fix

Edge-worker source files use `.js` extensions for JSR compatibility:
```typescript
// Original in edge-worker
import { foo } from './bar.js';
```

The sync script automatically converts these to `.ts` for local development:
```typescript
// After sync
import { foo } from './bar.ts';
```

## Manual Operations

### Sync Dependencies Once

```bash
pnpm nx sync-edge-deps playground
```

### Switch to Production Mode

To test with published packages:

1. Delete or rename `import_map.json`
2. Copy `deno.prod.json` to `deno.json`

### Switch Back to Local Mode

1. Restore `deno.json` to use import map
2. Run sync script to regenerate vendor directory

## Caveats and Limitations

### 1. Import Extensions
- Edge-worker uses `.js` extensions in imports for JSR
- These are automatically converted to `.ts` during sync
- This means the vendor files differ from source files

### 2. Build Requirements
- You must build core and dsl packages before syncing
- The sync script does this automatically
- Build failures will prevent syncing

### 3. Type Definitions
- TypeScript may have issues with complex type imports
- Some type-only imports might need adjustment
- The compiled packages include `.d.ts` files

### 4. Subpath Imports
- Imports like `@pgflow/dsl/supabase` need explicit mapping
- Add these to `import_map.json` as needed:
  ```json
  "@pgflow/dsl/supabase": "./_vendor/@pgflow/dsl/supabase.js"
  ```

### 5. Docker Isolation
- All dependencies must be inside `supabase/functions/`
- Symlinks don't work reliably with Docker
- File changes might require function restart

### 6. Version Mismatch
- Local packages might differ from published versions
- Test with production config before deploying
- Keep `deno.prod.json` updated with latest versions

## Troubleshooting

### Module Not Found Errors

If you see "Module not found" errors:

1. Check if the import needs a subpath mapping
2. Verify the file exists in vendor directory
3. Ensure import extensions are correct (.js for compiled, .ts for source)

### Type Errors

TypeScript errors in your flow definitions are unrelated to the vendor setup. Fix these in your flow files.

### Changes Not Reflected

If your changes aren't showing up:

1. Run the sync script again to update dependencies
2. Check that builds succeed
3. Restart edge functions if needed
4. Clear Deno cache: `deno cache --reload`

### Permission Errors

Make the sync script executable:
```bash
chmod +x examples/playground/scripts/sync-edge-deps.sh
```

## Best Practices

1. **Run the sync script** after making changes to pgflow packages
2. **Test with production config** before deploying
3. **Commit import_map.json** - it's part of the development setup
4. **Don't commit _vendor/** - it's generated and gitignored
5. **Keep both configs updated** - maintain both local and production configurations

## Directory Structure Reference

```
supabase/functions/
├── _vendor/                 # Generated - local packages (gitignored)
├── import_map.json         # Import mappings for local development
├── deno.json              # Uses import_map.json
├── deno.prod.json         # Production config with registry URLs
├── pgflow-cron-worker/    # Example edge function
└── analyze_website_worker_*/ # Worker functions
```

This setup provides a seamless local development experience while maintaining compatibility with production deployments.