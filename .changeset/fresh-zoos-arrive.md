---
'@pgflow/client': patch
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

**You can now use it in:**

- Node.js: `import { PgflowClient } from '@pgflow/client'`
- CommonJS: `const { PgflowClient } = require('@pgflow/client')`
- Browser: `<script src="https://unpkg.com/@pgflow/client"></script>`
- Bundlers: Automatically picks the right format
