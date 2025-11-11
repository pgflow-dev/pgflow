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

---

## Tasks

### 7. Create DAG Component

Create `apps/demo/src/lib/components/DAGVisualization.svelte`:

Use `@xyflow/svelte` to render 4 nodes:
- **Layout:** fetchArticle (top) → parallel nodes (middle) → publish (bottom)
- **Dynamic styling:** Active steps show pulsing animation
- **State integration:** Use pgflowState store to determine node colors/states
- **Visual states:** pending (gray), running (pulsing green), completed (solid green), failed (red)

---

### 8. Create Debug Panel Component

Create `apps/demo/src/lib/components/DebugPanel.svelte` with 3 sections:

1. **Run Information** - Flow slug, run ID, status, elapsed time
2. **Step States** - Collapsible sections for each step showing status/output/errors
3. **Event Stream** - Real-time log of all events with timestamps

**Key pattern:** Use `run.on('*', handler)` to collect all events for the stream display

---

### 9. Create Demo Page Layout

Update `apps/demo/src/routes/+page.svelte`:

- Two-column layout: DAG (left) + Debug Panel (right)
- URL input field + "Process Article" button
- Start flow and update pgflowState on events
- Subscribe to both run events and individual step events
- Set `activeStep` when steps start executing

**Note:** Remember to trigger reactivity by reassigning `pgflowState.run` after events

---

### 10. Add Brand Assets and Styles

Copy logos from website to static folder:
```bash
cp pkgs/website/src/assets/pgflow-logo-*.svg apps/demo/static/
```

Create `apps/demo/src/app.css` with pgflow brand colors:
- Primary accent: `#007b6e` (pgflow green)
- Define CSS variables for theme colors
- Add pulse animation keyframe for active states
- Set up light/dark mode variables if needed

Import styles in `apps/demo/src/routes/+layout.svelte`

---

### 11. Test Complete Flow

```bash
cd apps/demo && supabase start
supabase functions serve demo-worker  # Another terminal
pnpm nx dev demo  # From monorepo root
```

Open http://localhost:5173/, click "Process Article", verify:
- DAG nodes light up
- Parallel execution visible (summarize + extractKeywords)
- Retry on summarize step (fails → succeeds)
- Debug panel updates

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
- **Steps don't update:** Check reactivity (`pgflowState.run = run` after events), event subscriptions
- **No pulsing animation:** Check CSS keyframes, `--glow-color` variable
- **Retry doesn't happen:** Check `maxAttempts: 3`, `attemptNumber === 1` check, Edge Function logs

---

## Next Phase

Proceed to **Phase 4: Code Explanation** to add interactive code panel with syntax highlighting.
