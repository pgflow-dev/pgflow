# Phase 5: Results Modals

**Branch:** `feat-demo-5-results-modals`

**Prerequisite:** Complete Phase 4 (Code Explanation)

**Goal:** Add results card, output modal, and comprehensive layout. Complete all interactive UI elements.

**Success Criteria:**
- ✅ Results card animates in on completion
- ✅ Output modals work for large JSON (fetchArticle)
- ✅ All interactions feel smooth and intentional
- ✅ Layout includes all components

**Philosophy:** Make the demo interactive without being overwhelming. Every interaction should feel purposeful.

---

## Tasks

### 4. Create Results Card Component

Create `apps/demo/src/lib/components/ResultsCard.svelte`:

**Purpose:** Display successful completion with article details

**Implementation:**
- Only visible when `runStatus === 'completed'`
- Extract and display: title (from fetchArticle), summary (from summarize), keywords (from extractKeywords)
- Calculate duration from run.started_at to run.completed_at
- Animate in with slide-in effect
- Green gradient background to indicate success

---

### 5. Create Output Modal Component

Create `apps/demo/src/lib/components/OutputModal.svelte`:

**Purpose:** Display full JSON output for large step results (especially fetchArticle)

**Implementation:**
- Export `show(data)` function to open modal with JSON content
- Use Shiki to syntax highlight the JSON
- Full-screen overlay with centered content box
- Close on: X button, backdrop click, or Escape key
- Scrollable content area for large payloads

---

### 6. Update Debug Panel with Modal Triggers

Edit `apps/demo/src/lib/components/DebugPanel.svelte`:

- Import OutputModal component
- Add 🔍 icon next to step outputs (especially for large payloads)
- On icon click: call `outputModal.show(data)`
- Show truncated preview inline (first 100 chars)
- Bind OutputModal instance at component end

---

### 7. Update DAG with Click Handlers

Edit `apps/demo/src/lib/components/DAGVisualization.svelte`:

- Add node click handler to dispatch 'step-selected' event
- Pass node ID (step slug) in event detail
- Also dispatch 'scroll-to-step' for debug panel
- Wire handler to SvelteFlow's `onnodeclick` prop

---

### 8. Update Main Page Layout

Edit `apps/demo/src/routes/+page.svelte`:

Import new components:
- CodePanel, ExplanationPanel, ResultsCard

Update layout structure:
- Two-column grid: 40% left (code) / 60% right (observability)
- Left column: CodePanel + ExplanationPanel
- Right column: DAGVisualization + ResultsCard + DebugPanel
- Responsive: stacks to single column on narrow screens

---

### 9. Test All Interactions

```bash
# Restart everything
cd apps/demo
supabase functions serve demo-worker

# In another terminal (from root)
pnpm nx dev demo
```

**In browser, test:**

1. **DAG Click:**
   - Click a DAG node
   - Code panel should highlight corresponding section
   - Explanation panel should appear
   - Debug panel should scroll to that step

2. **Code Click:**
   - Click a line in code panel
   - Explanation panel should appear
   - Debug panel should scroll to that step

3. **Output Modal:**
   - After flow completes
   - Click 🔍 icon in debug panel
   - Modal should open with formatted JSON
   - Click outside or press Escape to close

4. **Results Card:**
   - After flow completes
   - Results card should slide in
   - Show title, summary, keywords, article ID

**Validate:** All interactions work smoothly

---

## Validation Checklist

- [ ] Code panel renders with syntax highlighting
- [ ] Clicking DAG node shows explanation panel
- [ ] Clicking code line shows explanation panel
- [ ] Explanation panel displays correct info
- [ ] Clicking DAG node scrolls debug panel
- [ ] Clicking code line scrolls debug panel
- [ ] Results card animates in on completion
- [ ] Results card shows all fields correctly
- [ ] 🔍 icon appears in debug panel for outputs
- [ ] Clicking 🔍 opens modal
- [ ] Modal shows formatted JSON
- [ ] Modal closes on backdrop click
- [ ] Modal closes on Escape key
- [ ] All animations smooth (no jank)

---

## Troubleshooting

**Problem: Modal not closing**
- Verify backdrop click handler
- Check Escape key listener
- Test with browser dev tools (Event Listeners tab)

**Problem: Results card not appearing**
- Check `runStatus === 'completed'` condition
- Verify `$derived` reactivity
- Check console for step output data

**Problem: All interactions feel janky**
- Check animation durations (should be 300-500ms)
- Verify no JavaScript blocking rendering
- Check for console errors

---

## Files Created/Modified

**Created:**
- `apps/demo/src/lib/components/CodePanel.svelte`
- `apps/demo/src/lib/components/ExplanationPanel.svelte`
- `apps/demo/src/lib/components/ResultsCard.svelte`
- `apps/demo/src/lib/components/OutputModal.svelte`

**Modified:**
- `apps/demo/src/lib/components/DebugPanel.svelte`
- `apps/demo/src/lib/components/DAGVisualization.svelte`
- `apps/demo/src/routes/+page.svelte`

---

## Next Phase

Proceed to **Phase 6: Polish Deploy** to add overlays, speed toggle, analytics, and deploy to production.
