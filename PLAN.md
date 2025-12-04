# PLAN: Auto-Compilation via ControlPlane

## Goals
1. **No manual `pgflow compile`** - eliminate CLI compilation step
2. **Seamless dev experience** - auto-recompile on any shape change
3. **Auto-compile new flows on production** - first deployment works automatically
4. **Fail fast on production shape mismatch** - prevent accidental overwrites

## Architecture Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Shape Storage | Compute on-the-fly | No DB migration, shows exact differences |
| Compilation Path | Worker → ControlPlane HTTP → SQL function | Central auth + transactional logic |
| Prod Missing Flow | Auto-compile | Enables first-time deployment |
| Prod Shape Mismatch | Fail fast | Prevents accidental overwrites |
| Dev Behavior | Always recompile | Seamless iteration |
| Strict Mode | Deferred (YAGNI) | Can be added later, CI/CD achieves same |

## Compilation Modes

| Mode | Flow Missing | Shape Mismatch | Use Case |
|------|--------------|----------------|----------|
| `development` | Compile | Recompile | Local dev, hot-reload-like |
| `production` | Compile | **FAIL** | Most production deployments |

**Note:** Strict mode (fail on missing) deferred. Users needing strict control can pre-compile via CI/CD - flow will already exist, so production mode never auto-compiles.

---

## Authentication

Workers authenticate with ControlPlane using the Supabase service role key (zero-config):

```
Env var: SUPABASE_SERVICE_ROLE_KEY (automatically available in Edge Functions)
Header: apikey: <service_role_key>
```

**Setup:**
- No setup required - both ControlPlane and Worker Edge Functions automatically have access to `SUPABASE_SERVICE_ROLE_KEY` via `Deno.env`
- Workers include `apikey` header in compilation requests
- ControlPlane verifies `apikey` header matches `SUPABASE_SERVICE_ROLE_KEY` env var

**ControlPlane Verification:**
```typescript
function verifyAuth(request: Request): boolean {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) return false;  // Not configured - reject all
  const apikey = request.headers.get('apikey');
  return apikey === serviceRoleKey;
}
```

---

## Architecture Overview

**Worker → ControlPlane HTTP → SQL Function (defense in depth)**

```
Worker.start(MyFlow)
    │
    ├── extractFlowShape(flow) → workerShape
    │
    └── POST /flows/:slug/ensure-compiled
        │   Body: { shape: workerShape, mode: 'development' | 'production' }
        │   Headers: { apikey: SUPABASE_SERVICE_ROLE_KEY }
        │
        └── ControlPlane (Layer 1: Deployment Validation)
            │
            ├── 1. Look up flow from registry by slug
            │      └── If not found: 404 "Flow not registered in ControlPlane"
            │
            ├── 2. controlPlaneShape = extractFlowShape(registeredFlow)
            │
            ├── 3. Compare workerShape vs controlPlaneShape (TypeScript)
            │      └── If mismatch: 409 "Worker/ControlPlane deployment mismatch"
            │
            └── 4. If shapes match: Call SQL function
                │
                └── sql`SELECT * FROM pgflow.ensure_flow_compiled($1, $2, $3)`
                    │
                    └── SQL Function (Layer 2: DB Validation - TRANSACTIONAL)
                        ├── Acquire advisory lock
                        ├── Query current shape from flows/steps/deps
                        ├── Compare controlPlaneShape vs DB shape
                        ├── If match: return 'verified'
                        ├── If missing (any mode): compile, return 'compiled'
                        ├── If different AND mode='development': recompile
                        ├── If different AND mode='production': return 'mismatch'
                        └── Return { status, differences[] }
```

### Defense in Depth - What Gets Caught

| Failure Mode | Layer | HTTP Status | Error |
|--------------|-------|-------------|-------|
| Flow not in ControlPlane | Layer 1 | 404 | "Flow 'x' not registered" |
| Worker ≠ ControlPlane shapes | Layer 1 | 409 | "Deployment mismatch: worker and ControlPlane have different definitions" |
| Flow not in DB | Layer 2 | 200 | Compiles automatically |
| ControlPlane ≠ DB (dev) | Layer 2 | 200 | Recompiles automatically |
| ControlPlane ≠ DB (prod) | Layer 2 | 409 | "Shape mismatch with database" |

### Why This Architecture

1. **Layer 1 (ControlPlane)** - Catches deployment bugs before touching DB
2. **Layer 2 (SQL)** - Transactional DB operations with advisory lock
3. **Both layers compare** - Worker sends shape, ControlPlane verifies AND uses its own
4. **Defense in depth** - Multiple validation points, clear error messages
5. **DB receives agreed shape** - Only shapes that match worker AND ControlPlane reach DB

---

## Implementation Overview

### Single ControlPlane Endpoint

```
POST /flows/:slug/ensure-compiled
  Headers: { apikey: SUPABASE_SERVICE_ROLE_KEY }
  Body: {
    shape: FlowShape,
    mode: 'development' | 'production'
  }
  Response: {
    status: 'compiled' | 'verified' | 'recompiled' | 'mismatch',
    differences?: string[]
  }
```

### Worker Startup Flow

```
Worker.start(MyFlow)
    |
    v
detectCompilationMode() --> 'development' | 'production'
    |
    v
extractFlowShape(flow) --> FlowShape
    |
    v
POST /ensure-compiled { shape, mode }
    |
    v
[status === 'mismatch'?] ----yes----> throw FlowShapeMismatchError(differences)
    |
    no
    v
Start polling loop
```

---

## Phase 1: Shape Extraction & Comparison (DSL Package)

**Location:** DSL package (alongside `compileFlow()`) - both are Flow introspection functions.

### New File: `pkgs/dsl/src/flow-shape.ts`

```typescript
/**
 * FlowShape captures the structural definition of a flow for drift detection.
 *
 * This represents the DAG topology - which steps exist, their types, and how
 * they connect via dependencies.
 *
 * Intentionally excluded:
 * - flowSlug: identifier, not structural data (comes from URL/context)
 * - options: runtime tunable via SQL without recompilation
 */
export interface FlowShape {
  steps: StepShape[];
}

export interface StepShape {
  slug: string;
  stepType: 'single' | 'map';
  dependencies: string[];  // sorted alphabetically for deterministic comparison
}

export interface ShapeComparisonResult {
  match: boolean;
  differences: string[];
}

export function extractFlowShape(flow: AnyFlow): FlowShape;

// Used by ControlPlane for Layer 1 comparison (Worker vs ControlPlane)
export function compareFlowShapes(a: FlowShape, b: FlowShape): ShapeComparisonResult;
```

**Note:** Runtime options (`maxAttempts`, `baseDelay`, `timeout`, `startDelay`) are intentionally
excluded from shape comparison. Users can tune these at runtime via SQL without recompilation.
See: `/deploy/tune-flow-config/`

### Export from `pkgs/dsl/src/index.ts`
- Add exports for `FlowShape`, `StepShape`, `ShapeComparisonResult`, `extractFlowShape`, `compareFlowShapes`

**Note:** `compareFlowShapes()` is used in BOTH:
- TypeScript (Layer 1: ControlPlane comparing worker vs its own shape)
- SQL (Layer 2: Comparing against DB) - reimplemented in plpgsql

---

## Phase 2: SQL Function for Shape Comparison + Compilation (Core Package)

### New File: `pkgs/core/schemas/0100_function_ensure_flow_compiled.sql`

```sql
CREATE OR REPLACE FUNCTION pgflow.ensure_flow_compiled(
  p_flow_slug text,
  p_shape jsonb,
  p_mode text DEFAULT 'production'  -- 'development' | 'production'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_db_shape jsonb;
  v_differences text[];
  v_flow_exists boolean;
BEGIN
  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows WHERE flow_slug = p_flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both modes)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._compile_flow_from_shape(p_flow_slug, p_shape);
    RETURN jsonb_build_object('status', 'compiled', 'differences', '[]'::jsonb);
  END IF;

  -- 3. Get current shape from DB
  v_db_shape := pgflow._get_flow_shape(p_flow_slug);

  -- 4. Compare shapes
  v_differences := pgflow._compare_flow_shapes(p_shape, v_db_shape);

  -- 5. If shapes match: return verified
  IF array_length(v_differences, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'verified', 'differences', '[]'::jsonb);
  END IF;

  -- 6. Shapes differ - handle by mode
  IF p_mode = 'development' THEN
    -- Recompile in dev mode
    PERFORM pgflow._delete_flow_definition(p_flow_slug);
    PERFORM pgflow._compile_flow_from_shape(p_flow_slug, p_shape);
    RETURN jsonb_build_object('status', 'recompiled', 'differences', to_jsonb(v_differences));
  ELSE
    -- Fail in production mode
    RETURN jsonb_build_object('status', 'mismatch', 'differences', to_jsonb(v_differences));
  END IF;
END;
$$;
```

### Helper Functions

```sql
-- Get current flow shape from DB as JSONB
CREATE OR REPLACE FUNCTION pgflow._get_flow_shape(p_flow_slug text)
RETURNS jsonb;

-- Compare two shapes, return array of difference descriptions
CREATE OR REPLACE FUNCTION pgflow._compare_flow_shapes(p_local jsonb, p_db jsonb)
RETURNS text[];

-- Compile flow from shape JSONB (calls create_flow + add_step)
CREATE OR REPLACE FUNCTION pgflow._compile_flow_from_shape(p_flow_slug text, p_shape jsonb)
RETURNS void;
```

### Recompilation = Full Deletion + Fresh Compile

**IMPORTANT:** "Recompile" means complete deletion of flow AND all its data, then fresh compile.

Uses the existing `delete_flow_and_data` function (currently in tests, promote to core):

```sql
-- From pkgs/core/supabase/tests/_shared/delete_flow_and_data.sql.raw
-- Deletes EVERYTHING:
--   - pgmq queue
--   - step_tasks
--   - step_states
--   - runs
--   - deps
--   - steps
--   - flows
pgflow.delete_flow_and_data(flow_slug TEXT)
```

**Why full deletion for recompile?**
1. Old runs reference old step structure (would be orphaned)
2. Clean slate is expected behavior in development
3. Production mode FAILS on mismatch - never auto-recompiles
4. Reuses battle-tested, documented function

**Recompilation in `ensure_flow_compiled`:**
```sql
IF p_mode = 'development' THEN
  -- Full deletion - removes ALL data (runs, tasks, queues, definitions)
  PERFORM pgflow.delete_flow_and_data(p_flow_slug);
  -- Fresh compile from shape
  PERFORM pgflow._compile_flow_from_shape(p_flow_slug, p_shape);
  RETURN jsonb_build_object('status', 'recompiled', ...);
END IF;
```

---

## Phase 3: ControlPlane Endpoint (Edge-Worker Package)

### Modify: `pkgs/edge-worker/src/control-plane/server.ts`

Add single endpoint that calls SQL function:

```typescript
// POST /flows/:slug/ensure-compiled
async function handleEnsureCompiled(
  sql: Sql,
  flowSlug: string,
  shape: FlowShape,
  mode: 'development' | 'production'
): Promise<Response> {
  const [result] = await sql`
    SELECT pgflow.ensure_flow_compiled(
      ${flowSlug},
      ${JSON.stringify(shape)}::jsonb,
      ${mode}
    ) as result
  `;

  return new Response(JSON.stringify(result.result), {
    status: result.result.status === 'mismatch' ? 409 : 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**HTTP Status Codes:**
- `200` - compiled, verified, or recompiled
- `409 Conflict` - shape mismatch in production mode
- `401 Unauthorized` - invalid apikey

---

## Phase 3.5: Include Options in FlowShape

Options (maxAttempts, baseDelay, timeout, startDelay) must be included in FlowShape for proper flow creation, while remaining excluded from shape comparison (options can be tuned at runtime without recompilation).

### Problem

`_create_flow_from_shape()` was using defaults instead of DSL-defined options, causing drift between:
- CLI path: `compileFlow()` -> SQL with options
- Runtime path: `extractFlowShape()` -> `_create_flow_from_shape()` -> defaults only

### Solution

1. **FlowShape includes options** - Added optional `options` field to FlowShape/StepShape
2. **NULL = use default** - Modified `create_flow()` to use COALESCE internally
3. **Pass options through** - Updated `_create_flow_from_shape()` to pass options from shape

### Key Files

| File | Change |
|------|--------|
| `pkgs/dsl/src/flow-shape.ts` | Add options to interfaces, update extractFlowShape() |
| `pkgs/core/schemas/0100_function_create_flow.sql` | NULL params = use default via COALESCE |
| `pkgs/core/schemas/0100_function_create_flow_from_shape.sql` | Pass options from shape |

### Design Decision: NULL = Use Default

SQL functions now treat NULL parameters as "use default" via COALESCE:

```sql
-- In create_flow():
INSERT INTO pgflow.flows (..., opt_max_attempts, ...)
VALUES (..., COALESCE(max_attempts, 3), ...);
```

This prevents drift - defaults are defined in ONE place (inside the function), not hardcoded by callers.

---

## Phase 4: Worker Configuration (Edge-Worker Package)

### Modify: `pkgs/edge-worker/src/core/workerConfigTypes.ts`

```typescript
export type CompilationMode = 'development' | 'production';

export interface FlowWorkerConfig {
  // ... existing fields ...

  /**
   * Compilation mode:
   * - 'development': Auto-compile if shape differs (calls /ensure-compiled)
   * - 'production': Fail if shape differs (calls /verify-compiled)
   * @default auto-detected from environment
   */
  compilationMode?: CompilationMode;

  /**
   * ControlPlane URL for compilation endpoints
   * @default derived from SUPABASE_URL + '/functions/v1/pgflow'
   */
  controlPlaneUrl?: string;
}
```

### Mode Detection Logic
```typescript
function detectCompilationMode(config: FlowWorkerConfig): CompilationMode {
  if (config.compilationMode) return config.compilationMode;
  const isLocal = config.env?.SUPABASE_URL?.includes('localhost')
               || config.env?.SUPABASE_URL?.includes('127.0.0.1');
  return isLocal ? 'development' : 'production';
}
```

---

## Phase 5: Worker Startup Integration

### Modify: `pkgs/edge-worker/src/flow/FlowWorkerLifecycle.ts`

Add compilation verification before `acknowledgeStart()`:

```typescript
async verifyOrCompileFlow(): Promise<void> {
  const shape = extractFlowShape(this.flow);
  const endpoint = this.mode === 'development'
    ? `/flows/${this.flow.slug}/ensure-compiled`
    : `/flows/${this.flow.slug}/verify-compiled`;

  const response = await fetch(`${this.controlPlaneUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ shape }),
  });

  const result = await response.json();

  if (result.status === 'mismatch') {
    throw new FlowShapeMismatchError(this.flow.slug, result.differences);
  }
  if (result.status === 'not_found' && this.mode === 'production') {
    throw new FlowNotCompiledError(this.flow.slug);
  }
}
```

### Modify: `pkgs/edge-worker/src/flow/createFlowWorker.ts`

Call verification before starting:

```typescript
export async function createFlowWorker(...) {
  // ... existing setup ...

  // NEW: Verify/compile flow before starting
  await lifecycle.verifyOrCompileFlow();

  // ... rest of existing code ...
}
```

---

## Critical Files to Modify

| Package | File | Changes |
|---------|------|---------|
| **DSL** | `pkgs/dsl/src/flow-shape.ts` | NEW - `FlowShape` interface + `extractFlowShape()` |
| **DSL** | `pkgs/dsl/src/index.ts` | Export new types/functions |
| **Core** | `pkgs/core/schemas/0100_function_ensure_flow_compiled.sql` | NEW - Main SQL function |
| **Core** | `pkgs/core/schemas/0100_function_get_flow_shape.sql` | NEW - Helper to query shape from DB |
| **Core** | `pkgs/core/schemas/0100_function_compare_flow_shapes.sql` | NEW - Shape comparison logic |
| **Core** | `pkgs/core/schemas/0100_function_compile_flow_from_shape.sql` | NEW - Compile from JSONB |
| **Core** | `pkgs/core/schemas/0100_function_delete_flow_and_data.sql` | PROMOTE from tests - Full flow deletion |
| **Edge** | `pkgs/edge-worker/src/control-plane/server.ts` | Add POST `/ensure-compiled` endpoint |
| **Edge** | `pkgs/edge-worker/src/flow/FlowWorkerLifecycle.ts` | Add `verifyOrCompileFlow()` |
| **Edge** | `pkgs/edge-worker/src/flow/createFlowWorker.ts` | Call verification at startup |
| **Edge** | `pkgs/edge-worker/src/core/workerConfigTypes.ts` | Add `CompilationMode` config |

---

## TDD Approach

Test-Driven Development order - write tests FIRST, then implement:

### TDD Phase 1: DSL Shape Functions (Vitest)

```
1. Write test: extractFlowShape() returns correct structure for simple flow
2. Implement extractFlowShape() - make test pass
3. Write test: extractFlowShape() handles map steps correctly
4. Extend implementation
5. Write test: extractFlowShape() sorts dependencies alphabetically
6. Extend implementation
7. Write test: compareFlowShapes() returns match=true for identical shapes
8. Implement compareFlowShapes()
9. Write test: compareFlowShapes() detects missing step
10. Write test: compareFlowShapes() detects extra step
11. Write test: compareFlowShapes() detects changed dependencies
12. Write test: compareFlowShapes() ignores options (runtime tunable)
13. Extend implementation for each difference type
```

### TDD Phase 2: SQL Functions (pgTAP)

```
1. Write test: _get_flow_shape() returns NULL for non-existent flow
2. Implement _get_flow_shape()
3. Write test: _get_flow_shape() returns correct JSONB for simple flow
4. Extend implementation
5. Write test: _compare_flow_shapes() returns empty array for matching shapes
6. Implement _compare_flow_shapes()
7. Write test: _compare_flow_shapes() detects each difference type
8. Extend implementation
9. Write test: _compile_flow_from_shape() creates flow from JSONB
10. Implement _compile_flow_from_shape()
11. Write test: _delete_flow_definition() removes flow/steps/deps but not runs
12. Implement _delete_flow_definition()
13. Write test: ensure_flow_compiled() returns 'compiled' for new flow
14. Implement ensure_flow_compiled() - happy path
15. Write test: ensure_flow_compiled() returns 'verified' for matching shape
16. Write test: ensure_flow_compiled() returns 'recompiled' in dev mode
17. Write test: ensure_flow_compiled() returns 'mismatch' in prod mode
18. Write test: ensure_flow_compiled() acquires advisory lock
19. Complete implementation
```

### TDD Phase 3: ControlPlane Endpoint (Vitest + Integration)

```
1. Write test: POST /ensure-compiled returns 404 if flow not in registry
2. Implement registry lookup
3. Write test: POST /ensure-compiled returns 409 if worker≠ControlPlane shape
4. Implement Layer 1 comparison
5. Write test: POST /ensure-compiled returns 401 for invalid apikey
6. Implement auth check
7. Write test: POST /ensure-compiled calls SQL function and returns result
8. Implement SQL function call
```

### TDD Phase 4: Worker Integration (Vitest + E2E)

```
1. Write test: Worker calls /ensure-compiled with correct shape on startup
2. Implement verifyOrCompileFlow()
3. Write test: Worker throws FlowShapeMismatchError on 409
4. Implement error handling
5. Write test: Worker proceeds to polling on success
6. Wire up to createFlowWorker()
```

---

## Testing Strategy

### pgTAP Tests (Core Package)
1. `pgflow.ensure_flow_compiled()` - All status codes (compiled, verified, recompiled, mismatch)
2. `pgflow._get_flow_shape()` - Correct JSONB output format
3. `pgflow._compare_flow_shapes()` - Detect all difference types (missing step, extra step, changed deps, changed stepType)
4. `pgflow._compile_flow_from_shape()` - Creates correct flows/steps/deps
5. `pgflow._delete_flow_definition()` - Removes only definition, not runs/tasks
6. Advisory lock behavior with concurrent calls

### Vitest Tests (DSL + Edge-Worker)
1. `extractFlowShape()` - Various flow configs (single, map, deps)
2. `compareFlowShapes()` - All difference detection scenarios
3. ControlPlane endpoint - HTTP response codes for each layer
4. `FlowWorkerLifecycle` - Mode detection and error handling

### Integration Tests
1. Dev mode: Worker auto-compiles missing flow
2. Dev mode: Worker auto-recompiles when shape differs
3. Prod mode: Worker compiles missing flow (first deploy)
4. Prod mode: Worker fails when shape differs (with clear error)
5. Auth: Worker with invalid apikey gets 401
6. Layer 1: Worker/ControlPlane mismatch detected before DB touched

---

## Implementation Sequence (Optimized)

### Why This Order?

1. **TypeScript defines the contract** - FlowShape format defined in TS first, SQL must match
2. **Parity check early** - Verify TS/SQL produce identical results before building on top
3. **Fail fast** - Each phase is testable independently before proceeding
4. **Reuse existing code** - `delete_flow_and_data` already works, just promote it

---

### Phase 1: DSL Types & Shape Extraction (~0.5 day)

**Order within phase:**
1. Define `FlowShape`, `StepShape`, `ShapeComparisonResult` interfaces
2. Write Vitest tests for `extractFlowShape()` with various Flow configs
3. Implement `extractFlowShape()`
4. Write Vitest tests for `compareFlowShapes()` (all difference types)
5. Implement `compareFlowShapes()`
6. Export from `index.ts`

**Why first?**
- No dependencies - can start immediately
- Fast iteration with Vitest
- Defines the "shape contract" that SQL must match
- Types guide the SQL implementation

**Deliverable:** DSL package exports working shape functions with full test coverage.

---

### Phase 2: Promote `delete_flow_and_data` (~0.5 day)

**Order within phase:**
1. Copy from `pkgs/core/supabase/tests/_shared/delete_flow_and_data.sql.raw`
2. Create `pkgs/core/schemas/0100_function_delete_flow_and_data.sql`
3. Verify existing pgTAP tests still pass
4. Add to Atlas migration

**Why second?**
- Already tested and documented
- Zero new code - just promotion
- Needed by `ensure_flow_compiled()` for recompilation
- Quick win, reduces risk

**Deliverable:** `pgflow.delete_flow_and_data()` available in core schema.

---

### Phase 3: SQL Helper - `_get_flow_shape` (~0.5 day)

**Order within phase:**
1. Write pgTAP test: returns NULL for non-existent flow
2. Write pgTAP test: returns correct JSONB structure matching TypeScript FlowShape
3. Implement `_get_flow_shape()`
4. **PARITY CHECK:** Write test that compares output with TypeScript `extractFlowShape()` for same flow

**Why third?**
- Simplest SQL helper
- Output format MUST match TypeScript - verify early
- Foundation for comparison

**Deliverable:** SQL function that produces identical JSONB to TypeScript FlowShape.

---

### Phase 4: SQL Helper - `_compare_flow_shapes` (~0.5 day)

**Order within phase:**
1. Write pgTAP test: returns empty array for identical shapes
2. Write pgTAP test: detects missing step
3. Write pgTAP test: detects extra step
4. Write pgTAP test: detects changed dependencies
5. Write pgTAP test: detects changed stepType
6. Implement `_compare_flow_shapes()`
7. **PARITY CHECK:** Verify same inputs produce same differences as TypeScript

**Why fourth?**
- More complex than `_get_flow_shape`
- Must match TypeScript comparison exactly
- Verify parity before building main function

**Deliverable:** SQL comparison that produces identical results to TypeScript.

---

### Phase 5: SQL Helper - `_compile_flow_from_shape` (~0.5 day)

**Order within phase:**
1. Write pgTAP test: creates flow with correct options
2. Write pgTAP test: creates steps in correct order
3. Write pgTAP test: creates dependencies correctly
4. Write pgTAP test: handles map steps correctly
5. Implement using existing `create_flow()` and `add_step()`

**Why fifth?**
- More complex - transforms JSONB to SQL calls
- Depends on understanding shape format (verified in Phase 3)
- Isolated from advisory lock complexity

**Deliverable:** Can recreate a flow from FlowShape JSONB.

---

### Phase 6: SQL Main Function - `ensure_flow_compiled` (~1 day)

**Order within phase:**
1. Write pgTAP test: returns 'compiled' for new flow
2. Implement happy path (new flow)
3. Write pgTAP test: returns 'verified' for matching shape
4. Implement verification path
5. Write pgTAP test: returns 'recompiled' in dev mode with shape diff
6. Implement recompilation path (calls `delete_flow_and_data` + `_compile_flow_from_shape`)
7. Write pgTAP test: returns 'mismatch' in prod mode with shape diff
8. Implement mismatch path
9. Write pgTAP test: advisory lock prevents race conditions
10. Add advisory lock

**Why sixth?**
- Depends on ALL helpers
- Most complex function
- Advisory lock needs focused attention

**Deliverable:** Main SQL function with all status paths and concurrency handling.

---

### Phase 7: ControlPlane Endpoint (~0.5 day)

**Order within phase:**
1. Add auth verification (check `SUPABASE_SERVICE_ROLE_KEY`)
2. Add flow registry lookup (404 if not found)
3. Add Layer 1: TypeScript comparison (409 if worker≠ControlPlane)
4. Add Layer 2: SQL function call
5. Return appropriate HTTP status codes
6. Write Vitest tests for each response code

**Why seventh?**
- Depends on both DSL and SQL
- Simple HTTP wrapper around tested components
- Layer 1 (TS) before Layer 2 (SQL) for fail-fast

**Deliverable:** Working endpoint that validates and compiles flows.

---

### Phase 8: Worker Integration (~0.5 day)

**Order within phase:**
1. Add `CompilationMode` type to workerConfigTypes.ts
2. Add config options (`compilationMode`, `controlPlaneUrl`)
3. Implement `verifyOrCompileFlow()` in FlowWorkerLifecycle
4. Wire up in `createFlowWorker()` - call before polling starts
5. Write integration tests

**Why last?**
- Depends on ControlPlane endpoint
- Simple HTTP client code
- Integration tests validate entire stack

**Deliverable:** Workers auto-compile/verify at startup.

---

### Summary Timeline

| Phase | Component | Duration | Cumulative |
|-------|-----------|----------|------------|
| 1 | DSL types + functions | 0.5 day | 0.5 day |
| 2 | Promote delete_flow_and_data | 0.5 day | 1 day |
| 3 | SQL _get_flow_shape | 0.5 day | 1.5 days |
| 4 | SQL _compare_flow_shapes | 0.5 day | 2 days |
| 5 | SQL _compile_flow_from_shape | 0.5 day | 2.5 days |
| 6 | SQL ensure_flow_compiled | 1 day | 3.5 days |
| 7 | ControlPlane endpoint | 0.5 day | 4 days |
| 8 | Worker integration | 0.5 day | 4.5 days |

**Total: ~4.5 days**

---

### Critical Checkpoints

**After Phase 3:** Verify `_get_flow_shape()` output matches TypeScript `extractFlowShape()` format exactly.

**After Phase 4:** Verify `_compare_flow_shapes()` produces identical differences to TypeScript `compareFlowShapes()`.

**After Phase 6:** Full SQL stack works - can compile, verify, recompile flows via direct SQL calls.

**After Phase 7:** Full HTTP stack works - can call endpoint and get correct responses.

**After Phase 8:** End-to-end works - worker starts, calls endpoint, gets verified/compiled.

---

## Resolved Design Decisions

1. **CLI `pgflow compile` command** - KEEP. Free to maintain, useful for migration files.
2. **Advisory locks** - YES. Required for concurrent worker startups.
3. **Telemetry** - `created_at` already exists on `pgflow.flows`. Sufficient for MVP.
4. **pg_jsonschema validation** - SKIP. FlowShape generated by our code, not user input.
5. **Shape source** - DEFENSE IN DEPTH. Worker sends shape, ControlPlane compares against its own, then SQL compares against DB.
6. **FlowShape location** - DSL package (alongside `compileFlow()`).
7. **FlowShape extensibility** - Version field for migrations. Future schemas (Zod) will be part of shape comparison.
8. **Self-contained mode** - DEFERRED (YAGNI). Can add in ~30 min if Lovable.dev needs it.

---

## Self-Contained Mode (Deferred)

**Decision:** Skip for MVP. Add later if needed.

**Why defer:**
- ControlPlane already exists (0.9.0)
- Lovable.dev might work fine with ControlPlane
- Adding later is trivial (~30 lines, ~30 minutes)
- No architectural changes needed - just config flag + one `if` branch

**If needed later:**
```typescript
// Just add this to FlowWorkerLifecycle
if (this.config.selfContained) {
  // Direct SQL call
  await this.sql`SELECT pgflow.ensure_flow_compiled(...)`;
} else {
  // HTTP call (default)
  await fetch(controlPlaneUrl + '/ensure-compiled', ...);
}
```

SQL function is the core - how we call it is a trivial detail.

---

## Advisory Lock Implementation

Multiple workers may start simultaneously and all call `ensure_flow_compiled`. We use PostgreSQL advisory locks to serialize compilation:

```sql
-- In pgflow.ensure_flow_compiled():
DECLARE
  v_lock_key bigint;
BEGIN
  -- Generate lock key from flow_slug (deterministic hash)
  v_lock_key := ('x' || md5(p_flow_slug))::bit(64)::bigint;

  -- Acquire advisory lock (blocks until available)
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Now we have exclusive access for this flow_slug
  -- ... rest of function ...

  -- Lock automatically released at end of transaction
END;
```

**Behavior:**
1. Worker A calls `ensure_flow_compiled('my_flow')` - acquires lock
2. Worker B calls `ensure_flow_compiled('my_flow')` - blocks, waiting for lock
3. Worker A compiles flow, returns `'compiled'`, transaction commits, lock released
4. Worker B acquires lock, sees flow exists, shape matches, returns `'verified'`

**Why `pg_advisory_xact_lock`:**
- Transaction-scoped (auto-released on commit/rollback)
- Blocking (workers wait rather than fail)
- Per-flow granularity (different flows don't block each other)
