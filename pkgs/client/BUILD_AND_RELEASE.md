# Build and Release Guide for @pgflow/client

This document explains how @pgflow/client is built and distributed for different environments.

## Build Outputs

The package is built in multiple formats to support various JavaScript environments:

### Node.js Builds
- **ES Module** (`dist/index.js`) - Modern JavaScript modules using `import/export`
- **CommonJS** (`dist/index.cjs`) - Legacy Node.js format using `require()`
- Both formats exclude dependencies, expecting them to be installed separately
- Not minified - allows bundlers to optimize as needed

### Browser Build
- **IIFE Bundle** (`dist/pgflow-client.browser.js`) - Self-contained browser build
- Includes all dependencies bundled together
- Exposes `window.PgflowClient` global variable
- Always minified with terser for optimal file size
- Includes source maps for debugging

### TypeScript Declarations
- Full type definitions in `dist/src/` directory
- Main entry point at `dist/index.d.ts`
- Preserves complete type information for all exports

## Build Configuration

The build uses two Vite configurations:

1. **vite.config.ts** - Library builds (ES and CJS)
   - External dependencies for smaller bundle size
   - Generates TypeScript declarations with vite-plugin-dts
   - No minification - lets consumer's bundler handle it

2. **vite.browser.config.ts** - Browser build
   - Bundles all dependencies
   - IIFE format for direct browser usage
   - Always minified for production use

## Usage in Different Environments

### NPM Package
```bash
npm install @pgflow/client
```

```javascript
// ES Modules (recommended)
import { PgflowClient } from '@pgflow/client';

// CommonJS
const { PgflowClient } = require('@pgflow/client');
```

### Browser via CDN
```html
<script src="https://unpkg.com/@pgflow/client"></script>
<script>
  const client = new window.PgflowClient.PgflowClient({
    supabaseClient: supabase
  });
</script>
```

### Modern Bundlers
Bundlers like Webpack, Vite, and Rollup will automatically select the appropriate format:
- Browsers: Uses the browser build when `browser` condition is set
- Node.js: Uses ES modules for tree-shaking
- Fallback: CommonJS for compatibility

## Package.json Configuration

The package.json uses modern packaging standards:

```json
{
  "exports": {
    ".": {
      "browser": "./dist/pgflow-client.browser.js",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "default": "./dist/index.js"
    }
  },
  "unpkg": "./dist/pgflow-client.browser.js",
  "files": ["dist/**/*", "README.md", "LICENSE", "CHANGELOG.md"]
}
```

- **exports**: Conditional exports for different environments
- **unpkg**: CDN entry point for browsers
- **files**: Only necessary files included in npm package

## Building Locally

```bash
# Build all formats
pnpm nx build client

# Build only library formats
pnpm nx build:lib client

# Build only browser format
pnpm nx build:browser client
```

## Dependencies

- **Runtime**: @pgflow/core, @pgflow/dsl, nanoevents, uuid
- **Peer**: @supabase/supabase-js (required, not bundled)

The browser build includes all runtime dependencies except the peer dependency, which must be provided separately.