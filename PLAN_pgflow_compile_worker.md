# pgflow compile via Worker Endpoint

## Goal

Replace the problematic deno.json-based CLI compilation with a simple HTTP endpoint on the worker that returns flow shape as SQL statements.

---

## Key Insights

### What Matters for Compilation

**Flow STRUCTURE only:**
- Step slugs, step_index, step_type
- Dependencies between steps
- Flow-level and step-level options (maxAttempts, timeout, etc.)

**What DOESN'T matter:**
- Handler implementations (not stored in DB)
- Handler file changes (no migration needed)
- Imported modules (unless they affect flow structure)

**Conclusion:** Only the flow definition file's modification time matters for staleness checking.

---

## Architecture

### CLI Command
```bash
pgflow compile flows/my-flow.ts --worker my-flow-worker

# Optional flags
--skip-freshness-check  # Skip staleness validation
--timeout 30            # Wait timeout for auto-reload (default: 10s)
```

### Worker HTTP Endpoint
```
GET /functions/v1/<worker-name>/compile
```

**Response 200:**
```json
{
  "flow_slug": "my-flow",
  "started_at": "2025-01-31T15:30:45.123Z",
  "sql": [
    "SELECT pgflow.drop_flow_data('my-flow');",
    "SELECT pgflow.create_flow_from_shape('{...}');"
  ]
}
```

**Response 503:** (if worker not fully started)
```json
{
  "error": "worker_not_ready",
  "message": "Worker is starting up, try again in a moment"
}
```

---

## Workflow

### Local Development
```
1. Dev edits flows/my-flow.ts
2. Supabase detects change → auto-reloads Edge Function
3. Worker restarts, started_at updates
4. Dev runs: pgflow compile flows/my-flow.ts --worker my-worker
5. CLI:
   - Gets file mtime: 3:00pm
   - Calls /compile endpoint
   - Gets worker.started_at: 3:00:05pm
   - Compares: file mtime <= started_at → FRESH!
   - Generates migration file
```

### Staleness Detection
```
1. Dev edits flows/my-flow.ts at 3:00pm
2. Worker still running from 2:00pm (auto-reload disabled/failed)
3. Dev runs: pgflow compile flows/my-flow.ts --worker my-worker
4. CLI:
   - Gets file mtime: 3:00pm
   - Calls /compile endpoint
   - Gets worker.started_at: 2:00pm
   - Compares: file mtime > started_at → STALE!
   - Error: "Worker is stale. Restart worker or wait for auto-reload."
   - Optionally: Poll for freshness (up to --timeout seconds)
```

---

## Implementation Details

### Phase 1: Worker Endpoint (Trust-Based)

**Location:** `pkgs/edge-worker/src/compile-endpoint.ts`

**Requirements:**
1. Deno.serve handler must distinguish paths
2. `/` (root) → Start worker normally
3. `/compile` → Return compilation response, DON'T start worker

**Handler Logic:**
```typescript
// In platform adapter or EdgeWorker
Deno.serve((req) => {
  const url = new URL(req.url);

  if (url.pathname === '/compile') {
    return handleCompileRequest(flow);
  }

  // Normal worker startup for all other paths
  return handleWorkerRequest(req);
});
```

**Compile Handler:**
```typescript
async function handleCompileRequest(flow: AnyFlow) {
  // Get worker start time (from WorkerLifecycle or stored timestamp)
  const startedAt = getWorkerStartTime();

  // Serialize flow to shape
  const flowShape = serializeFlow(flow);

  // Generate SQL statements
  const sql = [
    `SELECT pgflow.drop_flow_data('${flow.slug}');`,
    `SELECT pgflow.create_flow_from_shape('${JSON.stringify(flowShape)}');`
  ];

  return Response.json({
    flow_slug: flow.slug,
    started_at: startedAt.toISOString(),
    sql
  });
}
```

**Worker Start Time Tracking:**
- Option 1: Use `WorkerLifecycle.startedAt` (if available)
- Option 2: Store timestamp on module load: `const WORKER_START_TIME = new Date();`
- Option 3: Query `pgflow.workers` table for `started_at`

**Preferred:** Option 2 (module-level constant) - simplest, no DB query needed.

### Phase 2: CLI Implementation

**Location:** `pkgs/cli/src/commands/compile/index.ts`

**Changes:**
1. Remove Deno runtime execution
2. Remove deno.json handling
3. Add HTTP client to call worker endpoint
4. Add staleness check logic
5. Add migration file generation (keep existing logic)

**Workflow:**
```typescript
async function compile(flowPath: string, options: CompileOptions) {
  // 1. Get file mtime
  const fileMtime = fs.statSync(flowPath).mtime;

  // 2. Discover worker URL
  const workerUrl = await discoverWorkerUrl(options.worker);

  // 3. Call /compile endpoint
  const response = await fetch(`${workerUrl}/compile`);
  const { flow_slug, started_at, sql } = await response.json();

  // 4. Check staleness (unless --skip-freshness-check)
  if (!options.skipFreshnessCheck) {
    const workerStartTime = new Date(started_at);
    if (fileMtime > workerStartTime) {
      // Worker is stale!
      if (options.timeout > 0) {
        await pollForFreshness(workerUrl, fileMtime, options.timeout);
      } else {
        throw new Error('Worker is stale. Restart worker or use --skip-freshness-check');
      }
    }
  }

  // 5. Generate migration file (existing logic)
  generateMigrationFile(flow_slug, sql);
}
```

**Worker URL Discovery:**
```typescript
async function discoverWorkerUrl(workerName: string): Promise<string> {
  // Use supabase status to get project URL
  const status = await runCommand('supabase', ['status', '--output', 'json']);
  const projectUrl = JSON.parse(status).api_url;

  return `${projectUrl}/functions/v1/${workerName}`;
}
```

**Staleness Polling:**
```typescript
async function pollForFreshness(
  workerUrl: string,
  requiredMtime: Date,
  timeoutSeconds: number
) {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${workerUrl}/compile`);
    const { started_at } = await response.json();
    const workerStartTime = new Date(started_at);

    if (requiredMtime <= workerStartTime) {
      // Worker is fresh!
      return;
    }

    // Wait 1 second before retry
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Worker did not reload within ${timeoutSeconds}s. Check Supabase logs.`);
}
```

---

## Supabase Auto-Reload Research

### Questions to Answer

1. **Does worker.started_at update on reload?**
   - Test: Edit flow file, check if `pgflow.workers.started_at` changes
   - If NO: Use module-level timestamp instead

2. **What's the reload delay?**
   - Measure time between file save and worker availability
   - Typical: 1-3 seconds?
   - Set default polling timeout to 10s

3. **Does it watch all files in functions/ dir?**
   - Test: Edit imported file, does worker reload?
   - For our use case: Only main flow file matters

4. **Reliability?**
   - Test: Edit file multiple times rapidly
   - Does auto-reload ever miss changes?
   - Add manual restart command if needed

### Testing Plan

```bash
# 1. Start local Supabase
supabase start

# 2. Deploy test worker
supabase functions serve my-test-worker

# 3. In another terminal, edit flow file
echo "// change" >> supabase/functions/my-test-worker/index.ts

# 4. Check worker logs for restart
# 5. Query pgflow.workers to check started_at
# 6. Measure time between edit and availability
```

---

## Benefits

### What We Gain
- ✅ No Deno runtime in CLI (simpler!)
- ✅ No deno.json configuration (less complexity!)
- ✅ Worker is source of truth (consistent!)
- ✅ Staleness detection via Supabase auto-reload
- ✅ Works for both local dev and production migration generation
- ✅ Simpler to test (HTTP endpoint vs Deno subprocess)

### What We Give Up
- ⚠️ Requires running worker for compilation (but this is already the case for local dev)
- ⚠️ Depends on Supabase auto-reload reliability (can be overridden with --skip-freshness-check)

---

## Implementation Phases

### Phase 1: Worker Endpoint (No Staleness Check)
**Goal:** Get basic `/compile` endpoint working

- [ ] Add path routing to Deno.serve handler
- [ ] Implement `/compile` endpoint handler
- [ ] Add `serializeFlow()` function (from PLAN_phase1.md)
- [ ] Store worker start time (module-level constant)
- [ ] Return JSON response with flow_slug, started_at, sql
- [ ] Test manually with curl/browser

**Deliverable:** Worker responds to `/compile` with SQL statements

### Phase 2: CLI Implementation
**Goal:** Replace deno.json approach with HTTP calls

- [ ] Remove Deno runtime execution from CLI
- [ ] Add worker URL discovery via `supabase status`
- [ ] Add HTTP client to call `/compile` endpoint
- [ ] Parse response and generate migration file
- [ ] Test with local worker

**Deliverable:** `pgflow compile flows/my-flow.ts --worker my-worker` generates migration

### Phase 3: Staleness Check (After Research)
**Goal:** Prevent stale compilations

- [ ] Research Supabase auto-reload behavior (see above)
- [ ] Add file mtime reading to CLI
- [ ] Add staleness comparison logic
- [ ] Add polling with timeout
- [ ] Add `--skip-freshness-check` flag
- [ ] Add helpful error messages

**Deliverable:** CLI detects stale workers and waits for reload

---

## Edge Cases & Mitigations

### Case 1: Worker not started yet
**Problem:** Dev runs compile before worker has fully started
**Mitigation:** Return 503 status, CLI retries with exponential backoff

### Case 2: Multiple workers for same flow
**Problem:** User has multiple instances running (shouldn't happen in local dev)
**Mitigation:** User must specify exact worker name with `--worker` flag

### Case 3: Auto-reload disabled/broken
**Problem:** Supabase auto-reload not working
**Mitigation:**
- CLI detects staleness, shows error with instructions
- User can use `--skip-freshness-check` to override
- Or manually restart: `supabase functions serve --no-verify-jwt`

### Case 4: Network issues
**Problem:** CLI can't reach worker (firewall, wrong URL, etc.)
**Mitigation:**
- Clear error messages with troubleshooting steps
- Verify `supabase status` shows correct URL
- Check worker is actually running

---

## Testing Strategy

### Manual Testing (Trust-Based Development)
Since we don't have E2E tests yet:

1. **Endpoint responds correctly:**
   ```bash
   curl http://localhost:54321/functions/v1/my-worker/compile
   # Should return JSON with flow_slug, started_at, sql
   ```

2. **Worker doesn't start on /compile:**
   - Check logs, ensure no "Worker started" message on /compile request
   - Ensure DB connections aren't created

3. **CLI generates migration:**
   ```bash
   pgflow compile flows/my-flow.ts --worker my-worker
   # Should create migration file in supabase/migrations/
   ```

4. **Staleness detection works:**
   - Edit flow file
   - Stop auto-reload (if possible) or simulate stale worker
   - Run compile
   - Should detect staleness and error/poll

### Future E2E Tests (When Available)
- Start worker, call /compile, verify response
- Edit flow, trigger reload, verify freshness
- Test staleness detection and polling
- Test error cases (worker not running, network errors)

---

## Success Criteria

Phase 1 is successful when:
- ✅ Worker has `/compile` endpoint that doesn't start worker
- ✅ Endpoint returns valid JSON with sql, flow_slug, started_at
- ✅ CLI can call endpoint and generate migration file
- ✅ No deno.json needed in CLI
- ✅ Works with `supabase functions serve` in local dev

Phase 2 is successful when:
- ✅ Staleness check detects outdated workers
- ✅ Polling waits for auto-reload (with timeout)
- ✅ Clear error messages guide users
- ✅ `--skip-freshness-check` flag works as escape hatch

---

## Open Questions

1. **Should /compile endpoint require authentication?**
   - Local dev: Probably not needed (localhost only)
   - Production: Should never be exposed (but compile is local-only anyway)

2. **Should we support compiling multiple flows in one call?**
   - Phase 1: No, one flow per call
   - Future: Maybe `--all` flag to compile all flows?

3. **Where should serializeFlow() live?**
   - Option A: In `@pgflow/dsl` (shared with auto-compilation)
   - Option B: In `@pgflow/edge-worker` (keep isolated)
   - Preferred: Option A (reuse for Phase 1 auto-compilation)

4. **Should worker.started_at be stored in DB or memory?**
   - DB: More accurate, matches Phase 1 auto-compilation check
   - Memory: Simpler, no DB query needed
   - Preferred: Memory for Phase 1, consider DB later
