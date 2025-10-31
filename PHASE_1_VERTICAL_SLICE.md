# Phase 1: Vertical Slice

**Branch:** `feat-demo-1-vertical-slice`

**Goal:** Implement minimal end-to-end flow execution - from UI button click through Edge Function to real-time status updates. Validates entire integration stack with **no authentication required** - just public anon key access.

**Success Criteria:**
- ✅ Supabase initialized in demo app
- ✅ Edge Function with 1-step test flow executes
- ✅ pgflow packages vendored correctly
- ✅ pgflow client connects from UI (anon key only)
- ✅ Button click starts flow
- ✅ Status updates in real-time
- ✅ No console errors

**Philosophy:** Build the thinnest possible slice through the entire stack. UI will be ugly - that's fine. Goal is to prove integration works. **No authentication - just public demo with anon key!**

---

## Tasks

### 1. Add pgflow Client Dependency

```bash
cd apps/demo
pnpm add @pgflow/client
cd ../..
```

This will add `"@pgflow/client": "workspace:*"` to dependencies automatically.

### 2. Initialize Supabase

```bash
cd apps/demo && npx -y supabase@latest init && cd ../..
```

---

### 3. Install pgflow

Run the pgflow installer:

```bash
npx pgflow@latest install
```

This will:
- Update `supabase/config.toml` (adds pgflow schema, connection pooling)
- Copy pgflow migrations to `supabase/migrations/`

### 4. Create Anon Permissions Migration

Create `apps/demo/supabase/migrations/<timestamp>_demo_anon_permissions.sql`:

```sql
-- Grant anon role access to start flows
GRANT USAGE ON SCHEMA pgflow TO anon;
GRANT EXECUTE ON FUNCTION pgflow.start_flow TO anon;

-- Grant anon role read access to pgflow tables for real-time updates
GRANT SELECT ON pgflow.flows TO anon;
GRANT SELECT ON pgflow.runs TO anon;
GRANT SELECT ON pgflow.steps TO anon;
GRANT SELECT ON pgflow.step_states TO anon;
GRANT SELECT ON pgflow.deps TO anon;

-- Enable real-time for anon role
ALTER PUBLICATION supabase_realtime ADD TABLE pgflow.runs;
ALTER PUBLICATION supabase_realtime ADD TABLE pgflow.step_states;
```

### 5. Restart Supabase and Apply Migrations

```bash
npx -y supabase@latest stop
npx -y supabase@latest start
npx -y supabase@latest migrations up
```

---

### 6. Copy Vendoring Script

```bash
mkdir -p apps/demo/scripts
cp examples/playground/scripts/sync-edge-deps.sh apps/demo/scripts/
chmod +x apps/demo/scripts/sync-edge-deps.sh
```

### 7. Update Vendoring Script Paths

Edit `apps/demo/scripts/sync-edge-deps.sh` - replace `PLAYGROUND_DIR` with `DEMO_DIR`:

```bash
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$DEMO_DIR/supabase/functions/_vendor"
```

---

### 8. Add Nx Target for Vendoring

Edit `apps/demo/project.json` - add `sync-edge-deps` target:

```json
"sync-edge-deps": {
  "executor": "nx:run-commands",
  "dependsOn": ["core:build", "dsl:build"],
  "options": { "command": "./scripts/sync-edge-deps.sh", "cwd": "apps/demo" }
}
```

### 9. Build Dependencies and Vendor

```bash
pnpm nx build core dsl
pnpm nx sync-edge-deps demo  # Verify: ls apps/demo/supabase/functions/_vendor/@pgflow/
```

---

### 10. Create Test Flow Worker Directory

Create worker directory with flow definition inside:

```bash
mkdir -p apps/demo/supabase/functions/test_flow_worker
```

### 11. Create Test Flow Definition

Create `apps/demo/supabase/functions/test_flow_worker/test_flow.ts`:

```typescript
import { Flow } from '@pgflow/dsl';

export default new Flow<{ message: string }>({ slug: 'test_flow' }).step(
  { slug: 'greet' },
  (input) => `Hello, ${input.run.message}!`
);
```

**Note:** Flow slug is `test_flow` (with underscore), matching the worker directory name.

### 12. Create Edge Function Worker

Create `apps/demo/supabase/functions/test_flow_worker/index.ts`:

```typescript
import { EdgeWorker } from '@pgflow/edge-worker';
import TestFlow from './test_flow.ts';

EdgeWorker.start(TestFlow);
```

**This 3-line pattern is critical - it's how all pgflow workers are set up!**

### 13. Create Deno Import Map

Create `apps/demo/supabase/functions/test_flow_worker/deno.json`:

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

**Critical:** This maps all `@pgflow/*` imports to the vendored packages (one level up), including subpaths and required dependencies!

---

### 14. Configure Edge Function in config.toml

Edit `apps/demo/supabase/config.toml`, add at the end:

```toml
[functions.test_flow_worker]
enabled = true
verify_jwt = false
import_map = "./functions/test_flow_worker/deno.json"
entrypoint = "./functions/test_flow_worker/index.ts"
```

**Critical:** `verify_jwt = false` allows public demo access without authentication.

---

### 15. Build Client Package

```bash
pnpm nx build client
```

### 16. Test Edge Function Locally

```bash
cd apps/demo
npx -y supabase@latest start  # Then in another terminal:
npx -y supabase@latest functions serve test_flow_worker
```

### 17. Create Client-Side Supabase Configuration

Create `apps/demo/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { PgflowClient } from '@pgflow/client';

// Hardcoded local Supabase defaults (Phase 1 - production config in Phase 6)
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const pgflow = new PgflowClient(supabase);
```

**Note:** Get the anon key from `npx -y supabase@latest status`. Environment variables for production will be added in Phase 6 (Deploy).

---

### 18. Create Minimal Test UI

Replace `apps/demo/src/routes/+page.svelte` with basic test interface:

```svelte
<script lang="ts">
  import { pgflow } from '$lib/supabase';

  let status = $state<string>('idle');
  let output = $state<string>('');
  let events = $state<string[]>([]);

  async function startTestFlow() {
    status = 'starting...';
    events = [];
    output = '';

    try {
      const run = await pgflow.startFlow('test_flow', { message: 'World' });

      run.on('*', (event) => {
        events = [...events, JSON.stringify(event, null, 2)];
        status = event.status || status;

        if (event.status === 'completed' && event.output) {
          output = JSON.stringify(event.output, null, 2);
        }
      });
    } catch (error) {
      status = 'error';
      output = error instanceof Error ? error.message : String(error);
    }
  }
</script>

<div class="container">
  <h1>pgflow Demo - Phase 1 Vertical Slice</h1>

  <div class="controls">
    <button onclick={startTestFlow}>Start Test Flow</button>
  </div>

  <div class="status">
    <h2>Status</h2>
    <p>{status}</p>
  </div>

  {#if output}
    <div class="output">
      <h2>Output</h2>
      <pre>{output}</pre>
    </div>
  {/if}

  {#if events.length > 0}
    <div class="events">
      <h2>Events</h2>
      {#each events as event}
        <pre>{event}</pre>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Add basic styling for layout */
</style>
```

**Key patterns:**
- Use `onclick={handler}` not `on:click` (Svelte 5 syntax)
- Svelte 5 state: `let status = $state<string>('idle')`
- Start flow: `pgflow.startFlow('test_flow', { message: 'World' })`
- Listen to events: `run.on('*', (event) => { ... })`

---

### 19. Start Dev Server

```bash
pnpm nx dev demo  # Ensure npx -y supabase@latest start running
```

### 20. Test End-to-End

Open http://localhost:5173/, click button, verify:
- Status: `idle` → `starting...` → `running` → `completed`
- Output shows `"Hello, World!"`
- Events section shows real-time event stream

---

## Validation Checklist

- [ ] Supabase initialized, pgflow packages vendored
- [ ] Test flow + worker created in `test_flow_worker/` directory
- [ ] Worker configured in `config.toml` with `verify_jwt = false`
- [ ] Deno import map created with all dependencies
- [ ] `npx -y supabase@latest start` and `functions serve test_flow_worker` running
- [ ] Dev server starts, button click starts flow
- [ ] Status updates real-time, output appears, events stream visible
- [ ] No authentication needed - works immediately on page load
- [ ] Flow slug is `test_flow` (with underscore)
- [ ] No console errors

---

## Troubleshooting

- **Vendoring fails:** Check `ls pkgs/core/dist`, rebuild with `pnpm nx build core dsl`
- **Edge Function won't start:** Check `npx -y supabase@latest status`, verify vendored files exist
- **Flow doesn't start:** Check browser console - Supabase connection, pgflow schema in config.toml, flow slug matches
- **No real-time updates:** Check Realtime enabled, Edge Function logs, Svelte `$state` reactivity
- **TypeScript errors:** Verify Svelte 5 syntax (`$state`, `onclick`)
- **Anon key issues:** Get correct key from `npx -y supabase@latest status`, ensure hardcoded in `lib/supabase.ts`

**Rollback:** Mock pgflow client to debug Edge Function separately

**Common issues:**
- `workspace:*` not resolving → `pnpm install --force`
- Port in use → `lsof -i :54321`, kill process
- Import paths wrong → Re-run `pnpm nx sync-edge-deps demo`

---

## Next Phase

Proceed to **Phase 2: Article Flow** for 4-step flow and state management. Create branch `feat-demo-2-article-flow`.
