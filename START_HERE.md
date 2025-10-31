# START HERE: Demo App Implementation

**Goal:** Build pgflow interactive demo → https://demo.pgflow.dev

**Approach:** Vertical slice - build thin end-to-end first, then expand

---

## 📁 Documents

| File                          | Purpose                     |
| ----------------------------- | --------------------------- |
| **THIS FILE**                 | Overview + branch setup     |
| `.notes/prds/demo-app-prd.md` | Product requirements        |
| `PHASE_0-6.md` (7 files)      | Step-by-step implementation |

---

## 🚀 Quick Start

### Branch Names for Implementation

The implementation uses these branches (create as needed):

- `feat-demo-0-foundation` - Phase 0: Fresh SvelteKit + Nx
- `feat-demo-1-vertical-slice` - Phase 1: Client-side auth + Integration
- `feat-demo-2-article-flow` - Phase 2: Flow + stores
- `feat-demo-3-dag-debug` - Phase 3: DAG + Debug panel
- `feat-demo-4-code-explanation` - Phase 4: Code + Explanation
- `feat-demo-5-results-modals` - Phase 5: Results + Modals
- `feat-demo-6-polish-deploy` - Phase 6: Polish + Deploy

### Start Implementation

```bash
# Start with PHASE_0_FOUNDATION.md and follow checklist
# Creates fresh SvelteKit app from scratch
# Validate → Commit → Next branch → Next phase
```

---

## 🌲 Branch Strategy

7 sequential phases (0-6) for clean linear progression:

| Phase   | Branch                         | What Gets Built                     | Done |
| ------- | ------------------------------ | ----------------------------------- | ---- |
| Phase 0 | `feat-demo-0-foundation`       | Fresh SvelteKit app + Nx setup      | [x]  |
| Phase 1 | `feat-demo-1-vertical-slice`   | Client-side auth + end-to-end proof | [ ]  |
| Phase 2 | `feat-demo-2-article-flow`     | 4-step flow + stores                | [ ]  |
| Phase 3 | `feat-demo-3-dag-debug`        | DAG viz + Debug panel               | [ ]  |
| Phase 4 | `feat-demo-4-code-explanation` | Code panel + clicks                 | [ ]  |
| Phase 5 | `feat-demo-5-results-modals`   | Results card + modals               | [ ]  |
| Phase 6 | `feat-demo-6-polish-deploy`    | Overlays + analytics + ship         | [ ]  |

---

## 🎯 Key Concept: Vertical Slice

**Phase 1 is critical** - proves end-to-end integration works:

- Client-side anonymous auth (1 line!)
- 1-step test flow (backend)
- Button + status display (frontend)
- pgflow client connection (integration)

**Then expand incrementally:**

- Phase 2: 4-step flow + DAG/Debug visualizations
- Phase 3: Interactive elements
- Phase 4: Polish + deploy

**Why?** Catches integration issues early. Everything after Phase 1 is UI.

**Auth simplicity:** Client-side only! No server hooks, no session management, just `supabase.auth.signInAnonymously()` - perfect for public demos.

---

## ✅ Pre-Flight

- [ ] Read PRD
- [ ] Supabase CLI installed
- [ ] Deno installed
- [ ] Created 7-branch stack
- [ ] On `feat-demo-foundation`

---

## 🚀 Go

**Next:** Open `PHASE_0_FOUNDATION.md` and start. Validate after each phase.
