# Phase 4: Code Explanation

**Branch:** `feat-demo-4-code-explanation`

**Prerequisite:** Complete Phase 3 (DAG Debug)

**Goal:** Add code panel with syntax highlighting and explanation display. Enable users to understand flow structure while watching execution.

**Success Criteria:**
- ✅ Code panel shows flow definition with syntax highlighting
- ✅ Clicking DAG node → highlights code + scrolls debug panel
- ✅ Clicking code line → shows explanation panel + scrolls debug panel
- ✅ Explanation panel shows dependencies, inputs, returns

**Philosophy:** Make the demo interactive without being overwhelming. Every interaction should feel purposeful.

---

## Tasks

### 1. Add Shiki Dependency

Already added in Phase 2, verify:

```bash
# Check installation
ls node_modules/shiki
```

**If missing:**
```bash
cd apps/demo
pnpm add shiki
```

**Validate:** Shiki installed

---

### 2. Create Code Panel Component

Create `apps/demo/src/lib/components/CodePanel.svelte`:

**Purpose:** Display the flow definition code with syntax highlighting and interactive lines

**Implementation:**
- Use Shiki to highlight ~20 lines of flow code
- Track which step is active (from pgflowState) and selected (from clicks)
- Map line ranges to step slugs (e.g., lines 12-16 = fetchArticle)
- On line click: dispatch 'step-selected' event and update selection
- Visual states: active line (green bg), selected line (stronger green bg)

---

### 3. Create Explanation Panel Component

Create `apps/demo/src/lib/components/ExplanationPanel.svelte`:

**Purpose:** Show step details when user clicks on code or DAG

**Implementation:**
- Listen for 'step-selected' custom event
- Display: step name, dependencies, available inputs, return type
- Store step info in a static object (dependencies, inputs, returns)
- Appears below code panel with close button
- Dismisses on close button click or outside click

---

## Validation Checklist

- [ ] Code panel renders with syntax highlighting
- [ ] Clicking DAG node shows explanation panel
- [ ] Clicking code line shows explanation panel
- [ ] Explanation panel displays correct info
- [ ] Clicking DAG node scrolls debug panel
- [ ] Clicking code line scrolls debug panel

---

## Troubleshooting

**Problem: Shiki syntax highlighting not working**
```bash
# Check Shiki version
pnpm list shiki

# Try clearing cache and rebuilding
rm -rf apps/demo/.svelte-kit
pnpm nx dev demo
```

**Problem: Click events not firing**
- Check browser console for errors
- Verify event listeners attached (onMount)
- Check custom event names match

**Problem: Explanation panel doesn't update**
- Check `step-selected` event dispatched
- Verify event listener in ExplanationPanel
- Check `stepInfo` has data for all steps

---

## Next Phase

Proceed to **Phase 5: Results Modals** to add results card, output modal, and layout updates.
