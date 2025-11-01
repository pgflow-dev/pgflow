# Phase 2: Article Flow

**Branch:** `feat-demo-2-article-flow`

**Goal:** Implement 4-step article processing flow with state management. Establish data flow foundation for observability features.

**Success Criteria:**

- ✅ Article processing flow with 4 steps (fetch, summarize, extractKeywords, publish)
- ✅ Simulated retry on summarize step
- ✅ pgflow State Store manages run state
- ✅ All dependencies correctly configured

**Philosophy:** Build the state management foundation. Data flow is the key to everything that follows.

---

## Tasks

### 1. Install Required Dependencies

```bash
cd apps/demo
pnpm add @xyflow/svelte shiki
cd ../..
```

This installs:

- `@xyflow/svelte` - DAG visualization (used in Phase 3)
- `shiki` - Syntax highlighting (used in Phase 4+)

**Note:** Installing all frontend dependencies now simplifies later phases and avoids switching contexts when building UI components.

---

### 2. Copy Logo Assets

Copy pgflow logos for header component (used in Phase 6):

```bash
cp pkgs/website/src/assets/pgflow-logo-*.svg apps/demo/static/
```

This copies both light and dark variants of the pgflow logo.

---

### 3. Create Article Flow Worker

Create new Edge Function for the article flow:

```bash
cd apps/demo
npx -y supabase@latest functions new article_flow_worker
```

This creates `apps/demo/supabase/functions/article_flow_worker/` directory.

---

### 4. Create Article Processing Flow

Create `apps/demo/supabase/functions/article_flow_worker/article_flow.ts` with 4 steps:

```typescript
import { Flow } from '@pgflow/dsl';

// Task functions (implementations can be simple for Phase 2)
async function fetchArticle(url: string) {
  const response = await fetch(`https://r.jina.ai/${url}`);
  const content = await response.text();
  return { content, title: 'Article Title' };
}

function summarizeArticle(content: string, attemptNumber: number) {
  // Simulate failure on first attempt for retry demo
  if (attemptNumber === 1) {
    throw new Error('Simulated failure for retry demo');
  }
  return { summary: `Summary of article`, sentiment: 'positive' };
}

function extractKeywords(content: string) {
  return { keywords: ['keyword1', 'keyword2', 'keyword3'] };
}

function publishArticle(data: { summary: any; keywords: any }) {
  return {
    articleId: crypto.randomUUID(),
    publishedAt: new Date().toISOString(),
    ...data,
  };
}

// Flow definition - clean and minimal
export default new Flow<{ url: string }>({
  slug: 'article_flow',
  maxAttempts: 3,
})
  .step({ slug: 'fetch_article' }, async (input) => fetchArticle(input.run.url))
  .step({ slug: 'summarize', dependsOn: ['fetch_article'] }, (input) =>
    summarizeArticle(input.fetch_article.content, input.attemptNumber)
  )
  .step({ slug: 'extract_keywords', dependsOn: ['fetch_article'] }, (input) =>
    extractKeywords(input.fetch_article.content)
  )
  .step(
    { slug: 'publish', dependsOn: ['summarize', 'extract_keywords'] },
    (input) =>
      publishArticle({
        summary: input.summarize,
        keywords: input.extract_keywords,
      })
  );
```

**Key patterns:**

- Flow slug is `article_flow` (with underscore)
- Task functions defined separately for clarity
- Parallel execution: `summarize` and `extract_keywords` run simultaneously (both depend only on `fetch_article`)
- Retry simulation: `summarizeArticle` checks `attemptNumber` to fail first attempt
- Diamond DAG shape: 1 → 2 parallel → 1
- Minimal config: Only `slug` and `maxAttempts` (defaults used for baseDelay/timeout)
- Explicit `dependsOn` arrays show flow structure clearly

---

### 5. Create Edge Function Worker

Create `apps/demo/supabase/functions/article_flow_worker/index.ts`:

```typescript
import { EdgeWorker } from '@pgflow/edge-worker';
import ArticleFlow from './article_flow.ts';

EdgeWorker.start(ArticleFlow);
```

---

### 6. Create Deno Import Map

Create `apps/demo/supabase/functions/article_flow_worker/deno.json`:

```json
{
  "imports": {
    "@pgflow/core": "../_vendor/@pgflow/core/index.ts",
    "@pgflow/core/": "../_vendor/@pgflow/core/",
    "@pgflow/dsl": "../_vendor/@pgflow/dsl/index.ts",
    "@pgflow/dsl/": "../_vendor/@pgflow/dsl/",
    "@pgflow/dsl/supabase": "../_vendor/@pgflow/dsl/src/supabase.ts",
    "@pgflow/edge-worker": "../_vendor/@pgflow/edge-worker/index.ts",
    "@pgflow/edge-worker/": "../_vendor/@pgflow/edge-worker/",
    "@pgflow/edge-worker/_internal": "../_vendor/@pgflow/edge-worker/_internal.ts",
    "postgres": "npm:postgres@3.4.5",
    "@henrygd/queue": "jsr:@henrygd/queue@^1.0.7",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2.49.4"
  }
}
```

---

### 7. Configure Edge Function in config.toml

Edit `apps/demo/supabase/config.toml`, add at the end:

```toml
[functions.article_flow_worker]
enabled = true
verify_jwt = false
import_map = "./functions/article_flow_worker/deno.json"
entrypoint = "./functions/article_flow_worker/index.ts"
```

**Critical:** `verify_jwt = false` allows public demo access without authentication.

---

### 8. Set Environment Variables

Create `apps/demo/supabase/.env.local` with `JINA_API_KEY` (optional for now):

```bash
JINA_API_KEY=your_jina_api_key_here
```

---

### 9. Rebuild and Re-vendor

```bash
pnpm nx build core dsl client
pnpm nx sync-edge-deps demo
```

---

### 10. Test Edge Function Locally

```bash
cd apps/demo
npx -y supabase@latest start
# In another terminal:
npx -y supabase@latest functions serve article_flow_worker
```

---

### 11. Create pgflow State Store

Create `apps/demo/src/lib/stores/pgflow-state.svelte.ts`:

```typescript
import type { FlowRun } from '@pgflow/client';

class PgflowState {
  run = $state<FlowRun | null>(null);
  activeStep = $state<string | null>(null);

  steps = $derived(() => {
    // Derive step states from run
    if (!this.run) return new Map();
    // Implementation: map step states to slugs
    return new Map();
  });
}

export const pgflowState = new PgflowState();
```

**Purpose:** Central state management for flow execution, used by all UI components

**Key patterns:**

- Use Svelte 5 runes: `$state` and `$derived`
- Export singleton instance
- Will be updated in Phase 3 when building UI

---

## Validation Checklist

- [x] All dependencies installed (`@xyflow/svelte`, `shiki`)
- [x] Logo assets copied to `apps/demo/static/`
- [x] Article flow worker created (`article_flow_worker/`)
- [x] 4-step flow created with simulated retry
- [x] Worker configured in `config.toml` with `verify_jwt = false`
- [x] Deno import map created with all dependencies
- [x] pgflow State Store created and exported
- [x] Edge Function serves successfully
- [x] Build succeeds

---

## Troubleshooting

- **Build fails:** Check TypeScript errors, verify dependencies installed
- **Flow doesn't execute:** Check Edge Function logs, verify pgflow client connection
- **State not updating:** Check store exports, verify `$state` reactivity

---

## Next Phase

Proceed to **Phase 3: DAG Debug** to visualize the flow with DAG component and Debug panel.
