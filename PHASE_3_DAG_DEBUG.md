# Phase 3: DAG Debug

**Branch:** `feat-demo-3-dag-debug`

**Prerequisite:** Complete Phase 2 (Article Flow)

**Goal:** Visualize the 4-step flow with interactive DAG component and Debug panel. Demonstrate pgflow's core value: observability.

**Success Criteria:**
- ✅ DAG shows all 4 nodes with edges
- ✅ Active step highlights in DAG (pulsing glow)
- ✅ Debug panel shows run info + step states
- ✅ Parallel execution visible (summarize + extractKeywords)
- ✅ Retry visible in debug panel

**Philosophy:** Build the observability foundation. UI can still be basic - focus on data flow and state management.

**State Management:** Phase 2 already implemented `createFlowState()` which auto-discovers steps and manages all event subscriptions. Components receive `flowState` via props and access reactive state through getters.

---

## Tasks

### 1. Verify Dependencies

Confirm `@xyflow/svelte` was installed in Phase 2:

```bash
ls apps/demo/node_modules/@xyflow/svelte
```

**If missing:** Run `cd apps/demo && pnpm add @xyflow/svelte && cd ../..`

---

### 2. Create DAG Component

Create `apps/demo/src/lib/components/DAGVisualization.svelte`:

Use `@xyflow/svelte` to render 4 nodes:
- **Layout:** fetchArticle (top) → parallel nodes (middle) → publish (bottom)
- **Dynamic styling:** Active steps show pulsing animation
- **State integration:** Receive `flowState` via props to determine node colors/states
- **Visual states:** pending (gray), running (pulsing green), completed (solid green), failed (red)

**Props:** `{ flowState }` - the state object created by `createFlowState()`

---

### 3. Create Debug Panel Component

Create `apps/demo/src/lib/components/DebugPanel.svelte` with 3 sections:

1. **Run Information** - Flow slug, run ID, status, elapsed time
2. **Step States** - Collapsible sections for each step showing status/output/errors
3. **Event Stream** - Real-time log of all events with timestamps

**Props:** `{ flowState }` - the state object created by `createFlowState()`

**Key pattern:** The `flowState.events` array already contains all events (collected automatically by `createFlowState`)

---

### 4. Create Demo Page Layout

Update `apps/demo/src/routes/+page.svelte`:

- Two-column layout: DAG (left) + Debug Panel (right)
- URL input field + "Process Article" button
- Pass `flowState` to both DAG and Debug Panel components as props
- Flow state already created using `createFlowState<typeof ArticleFlow>(pgflow, 'article_flow')`
- Event handling is automatic (handled inside `createFlowState`)

**Key changes from current implementation:**
```svelte
<script lang="ts">
  import DAGVisualization from '$lib/components/DAGVisualization.svelte';
  import DebugPanel from '$lib/components/DebugPanel.svelte';
  // ... existing flowState setup ...
</script>

<div class="two-column-layout">
  <DAGVisualization {flowState} />
  <DebugPanel {flowState} />
</div>
```

**Note:** `createFlowState` already handles all event subscriptions and reactivity via getters

---

### 5. Add Brand Styles

Verify logos were copied in Phase 2:
```bash
ls apps/demo/static/pgflow-logo-*.svg
```

Create `apps/demo/src/app.css` with pgflow brand colors:
- Primary accent: `#007b6e` (pgflow green)
- Define CSS variables for theme colors
- Add pulse animation keyframe for active states
- Set up light/dark mode variables if needed

Import styles in `apps/demo/src/routes/+layout.svelte`

---

### 6. Test Complete Flow

```bash
cd apps/demo
npx -y supabase@latest start
# In another terminal:
npx -y supabase@latest functions serve article_flow_worker
# In another terminal (from monorepo root):
pnpm nx dev demo
```

Open http://localhost:5173/, click "Process Article", verify:
- DAG nodes light up
- Parallel execution visible (summarize + extract_keywords)
- Retry on summarize step (fails → succeeds)
- Debug panel updates

**Note:** Worker name is `article_flow_worker` (with underscore) matching the flow slug `article_flow`.

---

## Validation Checklist

- [ ] 4-step flow created with simulated retry
- [ ] DAG renders with pulsing animation
- [ ] Debug panel shows run info + step states + event stream
- [ ] Parallel execution visible
- [ ] Retry visible (error → retry)

---

## Troubleshooting

- **DAG doesn't render:** Check Svelte Flow installed, browser console, CSS variables
- **Steps don't update:** Check that components access `flowState.status`, `flowState.activeStep` etc. (reactivity works via getters)
- **No pulsing animation:** Check CSS keyframes, `--glow-color` variable
- **Retry doesn't happen:** Check `maxAttempts: 3`, `attemptNumber === 1` check, Edge Function logs
- **Props not reactive:** Ensure components use `flowState.property` (not destructuring) to maintain reactivity

---

## Next Phase

Proceed to **Phase 4: Code Explanation** to add interactive code panel with syntax highlighting.
