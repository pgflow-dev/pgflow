# Edge Worker Local Development Issue

## Problem Overview

The pgflow monorepo has a complex package publishing strategy that creates challenges for local development with Supabase Edge Functions:

1. **@pgflow/edge-worker** - Published to JSR (JavaScript Registry) as TypeScript source files
2. **@pgflow/core** and **@pgflow/dsl** - Published to npm as compiled JavaScript

During local development, the playground example needs to use unpublished local versions of these packages within Supabase Edge Functions, which run in isolated Docker containers.

## Current Setup

### Package Structure

```
pgflow/
├── pkgs/
│   ├── core/           # Published to npm
│   │   ├── src/        # TypeScript source
│   │   └── dist/       # Compiled output
│   ├── dsl/            # Published to npm
│   │   ├── src/        # TypeScript source
│   │   └── dist/       # Compiled output
│   └── edge-worker/    # Published to JSR
│       ├── src/        # TypeScript source (no dist!)
│       └── jsr.json    # JSR configuration
└── examples/
    └── playground/
        └── supabase/
            └── functions/
                ├── deno.json           # Import map configuration
                ├── _flows/             # Flow definitions
                └── analyze_website_worker_0/
                    └── index.ts        # Edge function entry point
```

### Current Import Configuration

**File:** `/examples/playground/supabase/functions/deno.json`
```json
{
  "imports": {
    "@pgflow/core": "npm:@pgflow/core@0.4.3",
    "@pgflow/dsl": "npm:@pgflow/dsl@0.4.3",
    "@pgflow/edge-worker": "jsr:@pgflow/edge-worker@0.4.3"
  }
}
```

**File:** `/pkgs/edge-worker/jsr.json`
```json
{
  "imports": {
    "@pgflow/core": "npm:@pgflow/core@0.5.4",
    "@pgflow/dsl": "npm:@pgflow/dsl@0.5.4"
  }
}
```

## The Problem in Detail

### Issue 1: Package Resolution Chain

When an edge function imports `@pgflow/edge-worker`:
1. Deno resolves it to the JSR registry
2. JSR serves the TypeScript source files from `edge-worker/src/`
3. These source files import `@pgflow/core` and `@pgflow/dsl`
4. JSR's import map points to npm versions, not local builds

### Issue 2: Docker Isolation

Supabase Edge Functions run in Docker containers that:
- Cannot access files outside of `supabase/functions/`
- Cannot resolve `workspace:*` or `file:../` references
- Require all dependencies to be within the container context

### Issue 3: Mixed Registry Problem

The edge-worker package is designed for JSR (TypeScript source) while its dependencies are designed for npm (compiled JavaScript). This creates a mismatch during local development.

## Step-by-Step Problem Reproduction

1. **Make a change to @pgflow/core or @pgflow/dsl**
   ```bash
   cd pkgs/core
   # Edit src/index.ts
   ```

2. **Build the packages**
   ```bash
   pnpm nx build core
   pnpm nx build dsl
   ```

3. **Try to run the edge function**
   ```bash
   cd examples/playground
   pnpm run start-functions
   ```

4. **Observe the problem**
   - The edge function still uses npm versions (0.4.3)
   - Local changes are not reflected
   - Cannot simply update deno.json to use file paths outside supabase/functions

## Solution Design

### Approach: Local Vendor Directory

Create a build process that:
1. Builds all dependencies
2. Copies them into a vendor directory inside `supabase/functions/`
3. Updates import maps to use these local files during development
4. Provides easy switching between local and published versions

### Implementation Plan

#### Step 1: Create Vendor Directory Structure

```
supabase/functions/
├── _vendor/              # Local development dependencies
│   ├── @pgflow/
│   │   ├── core/        # Built files from core package
│   │   ├── dsl/         # Built files from dsl package
│   │   └── edge-worker/ # Source files from edge-worker
│   └── import-map.json  # Local development import map
├── deno.json            # Production import map
└── deno.local.json      # Local development import map
```

#### Step 2: Build Script

Create a script that:
1. Builds core and dsl packages
2. Copies built outputs to vendor directory
3. Copies edge-worker source to vendor directory
4. Generates appropriate import maps

#### Step 3: Development Workflow

1. Run the vendor sync script
2. Use `--config deno.local.json` flag for local development
3. Automatic file watching for changes

## Detailed Solution Implementation

### 1. Create the Vendor Sync Script

**File:** `/examples/playground/scripts/sync-edge-deps.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYGROUND_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_ROOT="$(cd "$PLAYGROUND_DIR/../.." && pwd)"
VENDOR_DIR="$PLAYGROUND_DIR/supabase/functions/_vendor"

echo "🔄 Syncing edge function dependencies for local development..."

# Clean and create vendor directory
rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR/@pgflow"

# Build dependencies
echo "📦 Building packages..."
cd "$MONOREPO_ROOT"
pnpm nx build core
pnpm nx build dsl

# Copy core package
echo "📋 Copying @pgflow/core..."
mkdir -p "$VENDOR_DIR/@pgflow/core"
cp -r "$MONOREPO_ROOT/pkgs/core/dist/"* "$VENDOR_DIR/@pgflow/core/"
cp "$MONOREPO_ROOT/pkgs/core/package.json" "$VENDOR_DIR/@pgflow/core/"

# Copy dsl package
echo "📋 Copying @pgflow/dsl..."
mkdir -p "$VENDOR_DIR/@pgflow/dsl"
cp -r "$MONOREPO_ROOT/pkgs/dsl/dist/"* "$VENDOR_DIR/@pgflow/dsl/"
cp "$MONOREPO_ROOT/pkgs/dsl/package.json" "$VENDOR_DIR/@pgflow/dsl/"

# Copy edge-worker source (not built)
echo "📋 Copying @pgflow/edge-worker..."
mkdir -p "$VENDOR_DIR/@pgflow/edge-worker"
cp -r "$MONOREPO_ROOT/pkgs/edge-worker/src/"* "$VENDOR_DIR/@pgflow/edge-worker/"

echo "✅ Dependencies synced to $VENDOR_DIR"
```

### 2. Update deno.json for Local Development

The sync script automatically:
1. Backs up the production `deno.json` to `deno.production.json`
2. Updates `deno.json` with local vendor imports

This approach follows modern Deno best practices by keeping all imports in a single `deno.json` file rather than using separate import maps.
```

### 3. Add Nx Target for Local Development

**Update:** `/examples/playground/project.json`
```json
{
  "targets": {
    "sync-edge-deps": {
      "executor": "nx:run-commands",
      "options": {
        "command": "./scripts/sync-edge-deps.sh",
        "cwd": "examples/playground"
      }
    },
    "start-functions:local": {
      "executor": "nx:run-commands",
      "dependsOn": ["sync-edge-deps"],
      "options": {
        "command": "./scripts/supabase functions serve --env-file ./supabase/.env.local",
        "cwd": "examples/playground"
      }
    },
    "watch-edge-deps": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pnpm nx watch --projects=core,dsl,edge-worker -- pnpm nx sync-edge-deps playground",
        "cwd": "{workspaceRoot}"
      }
    }
  }
}
```

### 4. Direct deno.json Modification

The sync script directly modifies `deno.json` to use local vendor imports:

**Modified deno.json during local development:**
```json
{
  "imports": {
    "@pgflow/core": "./_vendor/@pgflow/core/index.js",
    "@pgflow/core/": "./_vendor/@pgflow/core/",
    "@pgflow/dsl": "./_vendor/@pgflow/dsl/index.js",
    "@pgflow/dsl/": "./_vendor/@pgflow/dsl/",
    "@pgflow/edge-worker": "./_vendor/@pgflow/edge-worker/index.ts",
    "@pgflow/edge-worker/": "./_vendor/@pgflow/edge-worker/",
    "@pgflow/edge-worker/_internal": "./_vendor/@pgflow/edge-worker/_internal.ts",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2.49.4",
    "@henrygd/queue": "jsr:@henrygd/queue@^1.0.7",
    "groq-sdk": "npm:groq-sdk@^0.20.1",
    "postgres": "npm:postgres@3.4.5",
    "sanitize-html": "npm:sanitize-html@^2.16.0",
    "turndown": "npm:turndown@^7.2.0"
  }
}
```

### 5. Add Restore Script for Production

Create a script to restore production dependencies when needed:

**File:** `/examples/playground/scripts/restore-production-deps.sh`

This script restores the original `deno.json` from the backup and optionally cleans up the vendor directory.

### 6. Git Ignore Configuration

**Update:** `/examples/playground/.gitignore`
```
# Local development vendor directory
supabase/functions/_vendor/
supabase/functions/deno.production.json
```

## Usage Instructions

### Initial Setup

1. Make the sync script executable:
   ```bash
   chmod +x examples/playground/scripts/sync-edge-deps.sh
   ```

2. Sync dependencies for the first time:
   ```bash
   cd examples/playground
   pnpm nx sync-edge-deps
   ```

### Development Workflow

1. **Start the watcher** (in terminal 1):
   ```bash
   pnpm nx watch-edge-deps playground
   ```

2. **Start Supabase** (in terminal 2):
   ```bash
   cd examples/playground
   pnpm start-supabase
   ```

3. **Start Edge Functions** (in terminal 3):
   ```bash
   cd examples/playground
   pnpm start-functions
   ```

4. **Make changes** to any package and they'll be automatically synced

### Switching Between Local and Published Versions

- **For local development**: Run `pnpm nx sync-edge-deps playground`
- **For production testing**: Run `pnpm nx restore-production-deps playground`

## Alternative Solutions Considered

1. **Symlinks**: Doesn't work reliably with Docker volume mounts
2. **Deno workspaces**: Not supported by Supabase Edge Functions
3. **Bundle everything**: Too complex with multiple entry points
4. **Publish to local registry**: Overly complex for development

## Troubleshooting

### Common Issues

1. **Permission denied**: Make sure sync script is executable
2. **Build failures**: Ensure all packages build successfully first
3. **Import errors**: Check that vendor directory structure matches import paths
4. **Docker issues**: Restart Supabase if file changes aren't detected

### Debug Commands

```bash
# Check vendor directory structure
ls -la examples/playground/supabase/functions/_vendor/@pgflow/

# Verify imports in edge function
cd examples/playground
supabase functions serve analyze_website_worker_0 --debug

# Test import resolution
deno info examples/playground/supabase/functions/analyze_website_worker_0/index.ts
```

## Conclusion

This solution provides a robust local development workflow for pgflow's Edge Worker package by:
- Maintaining the existing package structure
- Supporting hot-reload during development
- Keeping production deployment simple
- Avoiding complex build configurations

The vendor directory approach is a common pattern in Deno development and provides the best balance between simplicity and functionality.