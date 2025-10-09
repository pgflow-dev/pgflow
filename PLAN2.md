# Navigation Fix - Implementation Plan

Based on tech writer feedback (answers.md) adapted to our current structure.

## Core Approach: Option 2.5

**Default to Flows** with persistent secondary path to Background Jobs. No forced overview, minimal upfront decisions.

## Changes to Implement

### 1. Landing Page CTAs (Keep Current)

✅ **No change needed** - current CTAs are correct:
```yaml
Primary: "Get Started" → /get-started/installation/
Secondary: "How It Works" → /concepts/overview/how-pgflow-works/
```

**Rationale:** Installation is required for both paths, so it's the right first step.

### 2. Sidebar Structure (Keep Current with Minor Tweak)

✅ **Keep current nested structure** - it's correct:
```
Get Started (link: /get-started/installation/)
  - Installation
  - FAQ
  - Flows/
    - Create Flow
    - Compile Flow
    - Run Flow
  - Background Jobs/
    - Create Worker
```

**Why this works:**
- "Flows/" contains the sequential tutorial (create → compile → run)
- "Background Jobs/" is separate alternative path
- Nested structure shows they're both multi-step processes
- Visual hierarchy through ordering (Flows first)

**Rationale:** Tech writer suggested flat structure doesn't account for our multi-step tutorials. Our nested structure is better.

### 3. Remove Get Started Overview Page

❌ **Delete `/get-started/index.mdx`**

**Current content:**
- "Choose your path" cards (flows vs bg jobs)
- Links to installation
- Redundant with new decision strip

**Why remove:**
- Adds friction before installation
- Decision should come AFTER installation
- Forces reading when users want to act
- Installation is the actual first step

**Sidebar impact:**
- Get Started topic links directly to Installation
- Remove "Overview" from sidebar items
- Installation becomes the landing page

### 4. Add Decision Strip to Installation Page

✅ **Add at end of `/get-started/installation.mdx`:**

```markdown
## Next Steps

<CardGrid>
  <Card title="→ Create Your First Flow" icon="rocket">
    **Recommended:** Build multi-step workflows with dependencies, retries, and full observability.

    Perfect for: AI pipelines, data processing, complex orchestration

    [Start building →](/get-started/flows/create-flow/)
  </Card>

  <Card title="Or: Run Background Jobs" icon="setting">
    **Simpler alternative:** Just need background task processing with retries?

    Perfect for: Async tasks, webhooks, one-off jobs

    [Create a worker →](/get-started/background-jobs/create-worker/)
  </Card>
</CardGrid>

<Aside type="tip">
Most users want workflows. Choose background jobs only if you need simple queue processing without orchestration.
</Aside>
```

**Visual hierarchy:**
- Flows card: Larger, "Recommended" badge, primary styling
- BG Jobs card: Smaller, "Or:" prefix, secondary styling
- Clear nudge toward flows without hiding jobs

### 5. Optional: Compare Page (Future)

⚠️ **Not implementing now** - would be useful later:

Potential page: `/get-started/flows-vs-background-jobs/` or `/concepts/flows-vs-background-jobs/`

**Content (future):**
- Side-by-side comparison table
- When to use each
- Technical differences
- Link from FAQ or concepts

**Why not now:**
- Can be added later if users request it
- Not blocking for launch
- Decision strip is sufficient

---

## Implementation Steps

### Step 1: Remove Get Started Overview
```bash
git rm pkgs/website/src/content/docs/get-started/index.mdx
```

### Step 2: Update Sidebar Config
Remove "Overview" item from Get Started sidebar:
```javascript
{
  label: 'Get Started',
  icon: 'rocket',
  link: '/get-started/installation/',
  id: 'get-started',
  items: [
    // Remove: { label: 'Overview', link: '/get-started/' },
    { label: 'Installation', link: '/get-started/installation/' },
    { label: 'FAQ', link: '/get-started/faq/' },
    {
      label: 'Flows',
      autogenerate: { directory: 'get-started/flows/' },
    },
    {
      label: 'Background Jobs',
      autogenerate: { directory: 'get-started/background-jobs/' },
    },
  ],
}
```

### Step 3: Add Decision Strip to Installation
At end of `/get-started/installation.mdx`, add the "Next Steps" section with two cards (see above).

### Step 4: Add Redirect
Since we're removing `/get-started/` index, add redirect:
```javascript
redirects: {
  '/get-started/': '/get-started/installation/',
}
```

---

## User Journey After Changes

### Flow User (90% case):
```
1. Land on homepage → "Get Started"
2. Install pgflow
3. See decision strip → Choose "Create Your First Flow" (emphasized)
4. Follow tutorial: create → compile → run
```

### BG Jobs User (10% case):
```
1. Land on homepage → "Get Started"
2. Install pgflow
3. See decision strip → Choose "Run Background Jobs" (visible alternative)
4. Create worker, done
```

**Key improvement:** Both paths go through installation first, then make informed choice with clear nudge toward flows.

---

## Rationale

**Why this works:**
1. ✅ Minimal upfront decisions (just "Get Started")
2. ✅ Installation is required step (shown first)
3. ✅ Choice comes AFTER installation (when relevant)
4. ✅ Clear visual hierarchy (Flows emphasized)
5. ✅ BG Jobs still discoverable (not hidden)
6. ✅ Respects scanning behavior (big buttons, not text)
7. ✅ Progressive disclosure (complexity after install)

**Aligns with tech writer advice:**
- Default to flows ✅
- Persistent secondary path ✅
- Post-install choice strip ✅
- No forced overview ✅
- Visual hierarchy ✅

---

## Pre-Launch Checklist

Before Show HN:
- [ ] Remove overview page
- [ ] Update sidebar config
- [ ] Add decision strip to installation
- [ ] Add redirect
- [ ] Test build passes
- [ ] Verify all links work
- [ ] Check mobile display of decision cards

**Ship this for Show HN! 🚀**
