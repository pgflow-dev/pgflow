✅ > nx run dsl:typecheck
✅ > nx run dsl:build
✅ > nx run core:build
✅ > nx run core:typecheck
✅ > nx run cli:build
✅ > nx run client:build
✅ > nx run core:"lint:eslint"
✅ > nx run core:"lint:sqruff"
✅ > nx run cli:"test:e2e:install"
✅ > nx run cli:"test:e2e:compile"
✅ > nx run dsl:lint
✅ > nx run dsl:test
✅ > nx run client:typecheck
✅ > nx run edge-worker:lint
✅ > nx run client:lint
✅ > nx run edge-worker:typecheck
❌ > nx run playground:build

> next build

⚠ No build cache found. Please configure build caching for faster rebuilds. Read more: https://nextjs.org/docs/messages/no-cache
Attention: Next.js now collects completely anonymous telemetry regarding usage.
This information is used to shape Next.js' roadmap and prioritize features.
You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
https://nextjs.org/telemetry

     ▲ Next.js 15.3.3

     Creating an optimized production build ...

<w> [webpack.cache.PackFileCacheStrategy] Serializing big strings (124kiB) impacts deserialization performance (consider using Buffer instead and decode when needed)
<w> [webpack.cache.PackFileCacheStrategy] Serializing big strings (123kiB) impacts deserialization performance (consider using Buffer instead and decode when needed)
<w> [webpack.cache.PackFileCacheStrategy] Serializing big strings (124kiB) impacts deserialization performance (consider using Buffer instead and decode when needed)
Failed to compile.

./lib/pgflow-client-provider.tsx
Module not found: Can't resolve '@pgflow/client'

https://nextjs.org/docs/messages/module-not-found

./lib/pgflow-client-provider.tsx:4:1
Module not found: Can't resolve '@pgflow/client'
2 |
3 | import React, { createContext, useContext, useRef, ReactNode } from 'react';

> 4 | import { PgflowClient } from '@pgflow/client';

      | ^
    5 | import { createClient } from '@/utils/supabase/client';
    6 |
    7 | const PgflowClientContext = createContext<PgflowClient | null>(null);

https://nextjs.org/docs/messages/module-not-found
