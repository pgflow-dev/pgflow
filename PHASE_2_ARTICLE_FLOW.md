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

Add to `apps/demo/package.json`:
- `"@xyflow/svelte": "^0.1.18"` (DAG visualization)
- `"shiki": "^1.0.0"` (syntax highlighting)

```bash
pnpm install
```

---

### 2. Create Article Processing Flow

Create `apps/demo/supabase/functions/_flows/article-flow.ts` with 4 steps:

1. **fetchArticle** - Calls r.jina.ai API, returns `{ content, title }`
2. **summarize** - Depends on fetchArticle, simulates failure on first attempt (`attemptNumber === 1`)
3. **extractKeywords** - Depends on fetchArticle (runs parallel with summarize)
4. **publish** - Depends on both summarize and extractKeywords

**Key patterns:**
- Parallel execution: summarize and extractKeywords run simultaneously
- Retry simulation: Use `attemptNumber` param to fail first attempt
- Flow config: `maxAttempts: 3, baseDelay: 1, timeout: 60`

---

### 3. Update Edge Function Worker

Edit `apps/demo/supabase/functions/demo-worker/index.ts` - use ArticleFlow:

```typescript
import { EdgeWorker } from '@pgflow/edge-worker';
import ArticleFlow from '../_flows/article-flow.ts';

EdgeWorker.start(ArticleFlow);
```

### 4. Set Environment Variables

Create `apps/demo/supabase/.env.local` with `JINA_API_KEY` (optional for now)

### 5. Rebuild and Re-vendor

```bash
pnpm nx build core dsl
pnpm nx sync-edge-deps demo
cd apps/demo && supabase functions serve demo-worker
```

---

### 6. Create pgflow State Store

Create `apps/demo/src/lib/stores/pgflow-state.svelte.ts`:

Create a class-based store using Svelte 5 runes:
- `run = $state<FlowRun | null>(null)` - Current flow run
- `activeStep = $state<string | null>(null)` - Currently executing step
- `steps = $derived(...)` - Map of step states derived from run
- Export singleton instance

**Purpose:** Central state management for flow execution, used by all UI components

---

## Validation Checklist

- [ ] 4-step flow created with simulated retry
- [ ] Edge worker updated to use ArticleFlow
- [ ] pgflow State Store created and exported
- [ ] All dependencies installed
- [ ] Build succeeds

---

## Troubleshooting

- **Build fails:** Check TypeScript errors, verify dependencies installed
- **Flow doesn't execute:** Check Edge Function logs, verify pgflow client connection
- **State not updating:** Check store exports, verify `$state` reactivity

---

## Next Phase

Proceed to **Phase 3: DAG Debug** to visualize the flow with DAG component and Debug panel.
