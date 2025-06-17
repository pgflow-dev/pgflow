---
'@pgflow/client': patch
'@pgflow/core': patch
---

feat: add multi-target build support for @pgflow/client package

The @pgflow/client package now builds for multiple environments, making it usable in Node.js, browsers, and bundlers.

**What's new:**

- ES modules (`.js`) and CommonJS (`.cjs`) builds for Node.js
- Browser bundle (`.browser.js`) with all dependencies included
- Full TypeScript declarations
- CDN support via unpkg
- Production builds with minification
- Proper tree-shaking support
- `@supabase/supabase-js` is now a regular dependency (not peer dependency)

**You can now use it in:**

- Node.js: `import { PgflowClient } from '@pgflow/client'`
- CommonJS: `const { PgflowClient } = require('@pgflow/client')`
- Browser: `<script src="https://unpkg.com/@pgflow/client"></script>` - then use `window.pgflow.createClient(supabase)`
- Bundlers: Automatically picks the right format

**Other changes:**

- Pin Supabase CLI to exact version 2.21.1 to ensure consistent type generation between local and CI environments
