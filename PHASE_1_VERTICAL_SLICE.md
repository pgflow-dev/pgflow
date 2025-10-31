# Phase 1: Vertical Slice

**Branch:** `feat-demo-1-vertical-slice`

**Goal:** Implement minimal end-to-end flow execution - from UI button click through Edge Function to real-time status updates. Validates entire integration stack with **client-side auth only**.

**Success Criteria:**
- ✅ Supabase initialized in demo app
- ✅ Client-side anonymous auth working
- ✅ Edge Function with 1-step test flow executes
- ✅ pgflow packages vendored correctly
- ✅ pgflow client connects from UI
- ✅ Button click starts flow
- ✅ Status updates in real-time
- ✅ No console errors

**Philosophy:** Build the thinnest possible slice through the entire stack. UI will be ugly - that's fine. Goal is to prove integration works. **No server-side auth needed - demo is public!**

---

## Tasks

### 1. Add pgflow Client Dependency

Edit `apps/demo/package.json` - add `"@pgflow/client": "workspace:*"` to dependencies:

```bash
pnpm install
```

### 2. Initialize Supabase

```bash
cd apps/demo && supabase init && cd ../..
```

---

### 3. Configure Supabase for pgflow

Edit `apps/demo/supabase/config.toml` - add `"pgflow"` to `[api]` schemas:

```toml
schemas = ["public", "pgflow"]
```

---

### 4. Copy Vendoring Script

```bash
mkdir -p apps/demo/scripts
cp examples/playground/scripts/sync-edge-deps.sh apps/demo/scripts/
chmod +x apps/demo/scripts/sync-edge-deps.sh
```

### 5. Update Vendoring Script Paths

Edit `apps/demo/scripts/sync-edge-deps.sh` - replace `PLAYGROUND_DIR` with `DEMO_DIR`:

```bash
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$DEMO_DIR/supabase/functions/_vendor"
```

---

### 6. Add Nx Target for Vendoring

Edit `apps/demo/project.json` - add `sync-edge-deps` target:

```json
"sync-edge-deps": {
  "executor": "nx:run-commands",
  "dependsOn": ["core:build", "dsl:build"],
  "options": { "command": "./scripts/sync-edge-deps.sh", "cwd": "apps/demo" }
}
```

### 7. Build Dependencies and Vendor

```bash
pnpm nx build core dsl
pnpm nx sync-edge-deps demo  # Verify: ls apps/demo/supabase/functions/_vendor/@pgflow/
```

---

### 8. Create Test Flow Definition

Create `apps/demo/supabase/functions/_flows/test-flow.ts`:
- Import Flow from `@pgflow/dsl`
- Create simple 1-step flow with slug 'test-flow'
- Handler returns: `Hello, ${input.run.message}!`
- Note: Access run input via `input.run.*` pattern

### 9. Create Edge Function Worker

Create `apps/demo/supabase/functions/demo-worker/index.ts`:
```typescript
import { EdgeWorker } from '@pgflow/edge-worker';
import TestFlow from '../_flows/test-flow.ts';

EdgeWorker.start(TestFlow);
```
**This 3-line pattern is critical - it's how all pgflow workers are set up!**

### 10. Test Edge Function Locally

```bash
cd apps/demo
supabase start  # Then in another terminal:
supabase functions serve demo-worker
```

### 11. Create Client-Side Supabase Configuration

Create `apps/demo/src/lib/supabase.ts`:
- Create Supabase client with URL and anon key (use env vars or local defaults)
- Create PgflowClient wrapping the Supabase client
- Export both for use in components
- **Key point:** Pure client-side - no server hooks, no cookies!

---

### 12. Create Minimal Test UI

Replace `apps/demo/src/routes/+page.svelte` with basic test interface.

**Key patterns to implement:**
- Anonymous auth: `await supabase.auth.signInAnonymously()` in onMount
- Start flow: `pgflow.startFlow('test-flow', { message: 'World' })`
- Listen to events: `run.on('*', (event) => { ... })`
- Svelte 5 state: `let status = $state<string>('idle')`
- Display status updates and output

**Remember:** Use `onclick={handler}` not `on:click` (Svelte 5 syntax)

---

### 13. Start Dev Server

```bash
pnpm nx dev demo  # Ensure supabase start running
```

### 14. Test End-to-End

Open http://localhost:5173/, click button, verify:
- Status: `idle` → `starting...` → `running` → `completed`
- Output shows `"Hello, World!"`
- Console shows event stream

---

## Validation Checklist

- [ ] Supabase initialized, pgflow packages vendored
- [ ] Test flow + worker created
- [ ] Anonymous auth working (check Network tab for auth.signInAnonymously)
- [ ] `supabase start` and `functions serve demo-worker` running
- [ ] Dev server starts, button click starts flow
- [ ] Status updates real-time, output appears, no console errors

---

## Troubleshooting

- **Vendoring fails:** Check `ls pkgs/core/dist`, rebuild with `pnpm nx build core dsl`
- **Edge Function won't start:** Check `supabase status`, verify vendored files exist
- **Anonymous auth fails:** Check browser console, ensure Supabase anon key is valid
- **Flow doesn't start:** Check browser console - Supabase connection, pgflow schema in config.toml, flow slug matches
- **No real-time updates:** Check Realtime enabled, Edge Function logs, Svelte `$state` reactivity
- **TypeScript errors:** Verify Svelte 5 syntax (`$state`, `onclick`)
- **Auth issues:** Remember - this is all client-side! No server hooks needed

**Rollback:** Mock pgflow client to debug Edge Function separately

**Common issues:**
- `workspace:*` not resolving → `pnpm install --force`
- Port in use → `lsof -i :54321`, kill process
- Import paths wrong → Re-run `pnpm nx sync-edge-deps demo`

---

## Next Phase

Proceed to **Phase 2: Article Flow** for 4-step flow and state management. Create branch `feat-demo-2-article-flow`.
