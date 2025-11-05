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

**Phase 0 (Single Flow):**
```bash
pgflow compile flows/my-flow.ts --worker my-flow-worker

# Optional flags
--skip-freshness-check  # Skip staleness validation
--timeout 30            # Wait timeout for auto-reload (default: 10s)
```

**Future (Multiple Flows):**
```bash
# Compile specific flow by slug
pgflow compile --worker my-worker --flow my-flow

# Compile all flows from worker
pgflow compile --worker my-worker --all
```

### Worker HTTP Endpoint

**Endpoint:** `GET /functions/v1/<worker-name>/metadata`

**Response 200 (Phase 0 - Single Flow):**
```json
{
  "worker": {
    "worker_id": "abc123-def456-ghi789",
    "started_at": "2025-01-31T15:30:45.123Z"
  },
  "flows": {
    "my-flow": {
      "sql": [
        "SELECT pgflow.create_flow('my-flow');",
        "SELECT pgflow.add_step('my-flow', 'step1');",
        "SELECT pgflow.add_step('my-flow', 'step2', ARRAY['step1']);"
      ]
    }
  }
}
```

**Response 200 (Future - Multiple Flows & Enhancements):**
```json
{
  "worker": {
    "worker_id": "abc123-def456-ghi789",
    "started_at": "2025-01-31T15:30:45.123Z",
    "status": "running",
    "version": "1.2.0",
    "environment": "local"
  },
  "flows": {
    "flow-1": {
      "sql": ["SELECT pgflow.create_flow('flow-1');", "..."],
      "shape": { "slug": "flow-1", "steps": [...] },
      "options": { "maxAttempts": 3, "timeout": 30 }
    },
    "flow-2": {
      "sql": ["SELECT pgflow.create_flow('flow-2');", "..."],
      "shape": { "slug": "flow-2", "steps": [...] }
    }
  }
}
```

**Note:** `status`, `version`, and `environment` are future enhancements. Phase 0 only includes `worker_id` and `started_at`.

**Response 503:** (if worker not fully started)
```json
{
  "error": "worker_not_ready",
  "message": "Worker is starting up, try again in a moment"
}
```

### Design Rationale

**Why `/metadata` instead of `/compile`?**
- Extensible structure for future metadata (version, environment, etc.)
- Clean separation: worker-level vs flow-level metadata
- Supports multiple flows without API redesign
- Non-breaking: can add new fields to `worker` or per-flow objects

**Why nested structure?**
```json
{
  "worker": {...},    // Worker-level: worker_id, started_at (+ future: status, version, env)
  "flows": {          // Flow-level: sql (+ future: shape, options)
    "slug": {...}
  }
}
```
- **Phase 0 worker metadata:**
  - `worker_id`: Unique identifier for debugging (helpful to identify which worker instance)
  - `started_at`: Process restart time (for staleness check)
- **Future worker metadata:** `status`, `version`, `environment`, etc.
- **Phase 0 flow metadata:** `sql` only
- **Future flow metadata:** `shape`, `options`, `dependencies`, `version`, etc.
- Future-proof: easy to add new metadata at either level without breaking changes

**No source file paths needed!**
- Runtime cannot reliably determine source file paths from objects
- Phase 0: User provides file path to CLI, CLI knows mtime
- Future: User specifies flow by slug, not file path
- Staleness check uses worker.started_at (process-level, not per-file)

---

## Workflow

### Local Development (Phase 0)
```
1. Dev edits flows/my-flow.ts
2. Supabase detects change → auto-reloads Edge Function
3. Worker restarts, started_at updates
4. Dev runs: pgflow compile flows/my-flow.ts --worker my-worker
5. CLI:
   - Gets file mtime: 3:00pm
   - Calls GET /metadata endpoint
   - Receives: { worker: { started_at: "3:00:05pm" }, flows: { "my-flow": { sql: [...] } } }
   - Compares: file mtime <= worker.started_at → FRESH!
   - Extracts flows["my-flow"].sql
   - Generates migration file
```

### Staleness Detection (Phase 0)
```
1. Dev edits flows/my-flow.ts at 3:00pm
2. Worker still running from 2:00pm (auto-reload disabled/failed)
3. Dev runs: pgflow compile flows/my-flow.ts --worker my-worker
4. CLI:
   - Gets file mtime: 3:00pm
   - Calls GET /metadata endpoint
   - Receives: { worker: { started_at: "2:00pm" }, flows: {...} }
   - Compares: file mtime > worker.started_at → STALE!
   - Error: "Worker is stale. Restart worker or wait for auto-reload."
   - Optionally: Poll for freshness (up to --timeout seconds)
```

### Multiple Flows (Future)
```
1. Dev runs: pgflow compile --worker my-worker --flow flow-1
2. CLI:
   - Calls GET /metadata endpoint
   - Receives: { worker: {...}, flows: { "flow-1": {...}, "flow-2": {...} } }
   - Extracts flows["flow-1"].sql
   - Generates migration for flow-1 only

OR:

1. Dev runs: pgflow compile --worker my-worker --all
2. CLI:
   - Calls GET /metadata endpoint
   - Receives: { worker: {...}, flows: { "flow-1": {...}, "flow-2": {...} } }
   - Iterates over all flows
   - Generates migration for each flow
```

---

## Implementation Details

### Phase 0: Worker Endpoint

**Key Requirements:**
1. Add path routing: `/metadata` vs `/` (root)
2. `/metadata` returns metadata, does NOT start worker
3. `/` starts worker normally (existing behavior)

**Core Implementation:**
```typescript
// Store at module level
const WORKER_START_TIME = new Date();

// Handler returns:
{
  worker: {
    worker_id: workerId,        // From WorkerBootstrap/WorkerLifecycle
    started_at: WORKER_START_TIME.toISOString()
  },
  flows: {
    [flow.slug]: {
      sql: compileFlow(flow)    // Use EXISTING function from @pgflow/dsl
    }
  }
}
```

**Key Insight:** No new SQL generation logic needed - reuse existing `compileFlow()` from `@pgflow/dsl`.

### Phase 0: CLI Implementation

**Key Changes:**
1. Remove Deno runtime execution and deno.json handling
2. Call `/metadata` endpoint via HTTP
3. Extract SQL from response
4. Generate migration file (keep existing logic)

**Core Flow:**
```typescript
// 1. Get file mtime (for staleness check)
const fileMtime = fs.statSync(flowPath).mtime;

// 2. Discover worker URL via `supabase status`
const workerUrl = `${projectUrl}/functions/v1/${workerName}`;

// 3. Fetch metadata
const { worker, flows } = await fetch(`${workerUrl}/metadata`).then(r => r.json());

// 4. Staleness check: fileMtime vs worker.started_at
if (fileMtime > new Date(worker.started_at)) {
  // Worker stale - error or poll for auto-reload
}

// 5. Generate migration from flows[slug].sql
generateMigrationFile(flowSlug, flows[flowSlug].sql);
```

**Future:** Support `--flow <slug>` and `--all` flags for multiple flows.

---

## Supabase Auto-Reload Research

**Questions to validate:**
1. Does module-level `WORKER_START_TIME` update when Supabase auto-reloads?
2. What's the typical reload delay? (for polling timeout)
3. Does it watch all files in `functions/` dir or just main file?
4. How reliable is it? (rapid edits, edge cases)

**Simple test:** Edit flow file, check if `/metadata` endpoint returns updated `started_at`.

---

## Benefits

### What We Gain
- ✅ No Deno runtime in CLI (simpler!)
- ✅ No deno.json configuration (less complexity!)
- ✅ Worker is source of truth (consistent!)
- ✅ Staleness detection via Supabase auto-reload
- ✅ Works for both local dev and production migration generation
- ✅ Simpler to test (HTTP endpoint vs Deno subprocess)
- ✅ **Future-proof `/metadata` structure:**
  - Supports multiple flows without API redesign
  - Can add worker metadata (version, environment) without breaking changes
  - Can add flow metadata (shape, options) in Phase 1+ without breaking changes
  - Clean separation: worker-level vs flow-level metadata

### What We Give Up
- ⚠️ Requires running worker for compilation (but this is already the case for local dev)
- ⚠️ Depends on Supabase auto-reload reliability (can be overridden with --skip-freshness-check)

### Future Enhancements Enabled by `/metadata` Structure

**Phase 1 (Auto-Compilation):**
- Add `shape` field to flows: `flows[slug].shape = serializeFlow(flow)`
- Worker auto-compilation uses same shape for DB comparison
- No API changes needed!

**Future (Multiple Flows):**
- Add multiple flows to response: `flows: { "flow-1": {...}, "flow-2": {...} }`
- CLI iterates over flows or picks specific one by slug
- No API redesign needed!

**Future (Worker Metadata):**
- Add `worker.version` from package.json
- Add `worker.environment` detection (local/production)
- Add `worker.platform` info (Deno version, etc.)
- No breaking changes!

**Future (Flow Metadata):**
- Add `flows[slug].options` for runtime configuration
- Add `flows[slug].dependencies` for visualization
- Add `flows[slug].version` for flow versioning
- All backward-compatible additions!

---

## Implementation Phases

### Phase 0: Worker Endpoint (No Staleness Check)
**Goal:** Get basic `/metadata` endpoint working with existing `compileFlow()`

- [ ] Add path routing to Deno.serve handler (`/metadata` vs `/`)
- [ ] Implement `/metadata` endpoint handler
- [ ] Store worker start time (module-level constant: `const WORKER_START_TIME = new Date()`)
- [ ] Get worker_id from WorkerLifecycle or generate at module level
- [ ] Use **existing** `compileFlow()` from `@pgflow/dsl` (no new functions needed!)
- [ ] Return JSON response: `{ worker: { worker_id, started_at }, flows: { [slug]: { sql } } }`
- [ ] Test manually with curl/browser

**Deliverable:** Worker responds to `/metadata` with SQL statements and basic worker info (worker_id, started_at)

**Key Insights:**
- NO `serializeFlow()` needed yet! Just reuse existing `compileFlow()`
- NO `status`, `version`, `environment` needed yet! Just worker_id and started_at
- Future enhancements are easy to add without breaking changes

### Phase 0: CLI Implementation
**Goal:** Replace deno.json approach with HTTP calls

- [ ] Remove Deno runtime execution from CLI
- [ ] Remove deno.json handling
- [ ] Add worker URL discovery via `supabase status`
- [ ] Add HTTP client to call `/metadata` endpoint
- [ ] Parse response: `const { worker, flows } = await response.json()`
- [ ] Extract SQL: `const flowData = flows[flowSlug]`
- [ ] Generate migration file (keep existing logic)
- [ ] Test with local worker

**Deliverable:** `pgflow compile flows/my-flow.ts --worker my-worker` generates migration

### Phase 0 (Optional): Staleness Check
**Goal:** Prevent stale compilations (can be added after research)

- [ ] Research Supabase auto-reload behavior (see above)
- [ ] Add file mtime reading to CLI: `fs.statSync(flowPath).mtime`
- [ ] Add staleness comparison: `fileMtime > worker.started_at`
- [ ] Add polling with timeout (optional)
- [ ] Add `--skip-freshness-check` flag
- [ ] Add helpful error messages

**Deliverable:** CLI detects stale workers and waits for reload (or warns)

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
   curl http://localhost:54321/functions/v1/my-worker/metadata
   # Should return JSON: { worker: { started_at }, flows: { "my-flow": { sql: [...] } } }
   ```

2. **Worker doesn't start on /metadata:**
   - Check logs, ensure no "Worker started" message on /metadata request
   - Ensure DB connections aren't created
   - Only `/` (root path) should start worker

3. **CLI generates migration:**
   ```bash
   pgflow compile flows/my-flow.ts --worker my-worker
   # Should create migration file in supabase/migrations/
   ```

4. **Staleness detection works (if implemented):**
   - Edit flow file
   - Stop auto-reload (if possible) or simulate stale worker
   - Run compile
   - Should detect staleness and error/poll

5. **Future-proof structure:**
   - Verify response has nested `worker` and `flows` objects
   - Verify can add new fields without breaking CLI
   - Test with multiple flows (when supported)

### Future E2E Tests (When Available)
- Start worker, call /metadata, verify response structure
- Edit flow, trigger reload, verify freshness
- Test staleness detection and polling
- Test error cases (worker not running, network errors)
- Test multiple flows in single worker

---

## Success Criteria

**Phase 0 is successful when:**
- ✅ Worker has `/metadata` endpoint that doesn't start worker
- ✅ Endpoint returns valid JSON: `{ worker: {...}, flows: {...} }`
- ✅ Uses existing `compileFlow()` from `@pgflow/dsl` (no new functions!)
- ✅ CLI can call endpoint and generate migration file
- ✅ No deno.json needed in CLI
- ✅ No Deno runtime needed in CLI
- ✅ Works with `supabase functions serve` in local dev
- ✅ Structure supports future enhancements (multiple flows, metadata, etc.)

**Phase 0 (Optional) - Staleness Check is successful when:**
- ✅ Staleness check detects outdated workers
- ✅ Polling waits for auto-reload (with timeout)
- ✅ Clear error messages guide users
- ✅ `--skip-freshness-check` flag works as escape hatch

**Future Phases Build On This Foundation:**
- Phase 1: Add `serializeFlow()` and `flows[slug].shape` for auto-compilation
- Future: Add multiple flows support (CLI `--flow` and `--all` flags)
- Future: Add worker metadata (version, environment)
- Future: Add flow metadata (options, dependencies)

---

## Open Questions

1. **Should /metadata endpoint require authentication?**
   - Local dev: Probably not needed (localhost only)
   - Production: Should never be exposed (but compile is local-only anyway)
   - **Decision:** No auth for Phase 0 (local dev only)

2. **Should we support compiling multiple flows in one call?**
   - Phase 0: No, one flow per worker
   - Future: Yes, via `/metadata` structure (already supports it!)
   - **Decision:** Phase 0 returns single flow, structure ready for multiple

3. **Where should serializeFlow() live (Phase 1)?**
   - Option A: In `@pgflow/dsl` (shared with auto-compilation)
   - Option B: In `@pgflow/edge-worker` (keep isolated)
   - **Decision:** Option A (reuse for Phase 1 auto-compilation)

4. **Should worker.started_at be stored in DB or memory?**
   - DB: More accurate, matches Phase 1 auto-compilation check
   - Memory: Simpler, no DB query needed
   - **Decision:** Memory (module-level constant) for Phase 0

5. **Can we determine source file paths at runtime?**
   - Answer: **No, not reliably** in TypeScript/Deno
   - Stack traces don't show definition location
   - import.meta.url only works within the module
   - **Solution:** Don't rely on source paths! Use flow slugs instead
   - Phase 0: User provides file path to CLI
   - Future: User specifies flow by slug (`--flow my-flow`)

## Why This Design Works

### No Source Path Tracking Needed
The `/metadata` structure doesn't require knowing source file paths because:

1. **Phase 0 (Single Flow):**
   - User: `pgflow compile flows/my-flow.ts --worker my-worker`
   - CLI knows file path (user provided it)
   - CLI reads file mtime, compares with `worker.started_at`
   - Worker returns flow by slug, CLI matches it

2. **Future (Multiple Flows):**
   - User: `pgflow compile --worker my-worker --flow my-flow`
   - No file path needed! User specifies flow by slug
   - Worker returns all flows, CLI picks the requested one
   - Staleness check at worker level (process restart)

3. **Why Slugs > File Paths:**
   - Slugs are reliable (defined in flow code)
   - File paths are fragile (depend on FS location)
   - Runtime can't determine source paths anyway
   - Slugs work across environments (local, production)

### Future-Proof Without Complexity
The `/metadata` structure enables future features without painting us into a corner:

- ✅ Multiple flows: Just add more keys to `flows` object
- ✅ Worker metadata: Just add more keys to `worker` object
- ✅ Flow metadata: Just add more keys to each flow object
- ✅ Non-breaking: Old clients ignore new fields
- ✅ No source path magic needed
