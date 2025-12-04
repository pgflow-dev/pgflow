# PLAN: Auto-Compilation at Worker Startup

## Goals
1. **No manual `pgflow compile`** - eliminate CLI compilation step
2. **Seamless dev experience** - auto-recompile on any shape change
3. **Auto-compile new flows on production** - first deployment works automatically
4. **Fail fast on production shape mismatch** - prevent accidental overwrites

## Architecture Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Shape Storage | Compute on-the-fly | No DB migration, shows exact differences |
| Compilation Path | Worker → SQL function directly | Simpler, no HTTP overhead |
| Prod Missing Flow | Auto-compile | Enables first-time deployment |
| Prod Shape Mismatch | Fail fast | Prevents accidental overwrites |
| Dev Behavior | Always recompile | Seamless iteration |
| Strict Mode | Deferred (YAGNI) | Can be added later, CI/CD achieves same |
| Local Detection | Known local Supabase keys in Worker | Cryptographic certainty, PlatformAdapter decides |

## Compilation Modes

| Mode | Flow Missing | Shape Mismatch | Use Case |
|------|--------------|----------------|----------|
| `development` | Compile | Recompile | Local dev, hot-reload-like |
| `production` | Compile | **FAIL** | Most production deployments |

**Note:** Strict mode (fail on missing) deferred. Users needing strict control can pre-compile via CI/CD - flow will already exist, so production mode never auto-compiles.

---

## Local Development Detection (Safety-Critical)

**CRITICAL:** Development mode allows `delete_flow_and_data()` which destroys ALL flow data. False positive detection (thinking we're local when actually in production) would be catastrophic. We use a **default-to-production** approach with cryptographic certainty for local detection.

**Detection happens in Worker via PlatformAdapter.** The `isLocalEnvironment` property checks for known local Supabase keys - this is cryptographically safe since production keys are unique per-project.

### Known Local Supabase Keys

All local Supabase CLI installations use identical, deterministic keys generated from a fixed JWT secret. These values are documented in the [official Supabase CLI reference](https://supabase.com/docs/reference/cli/introduction):

```
JWT_SECRET: super-secret-jwt-token-with-at-least-32-characters-long

ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

SERVICE_ROLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

**Why this is cryptographically safe:**
- Production keys are generated with unique per-project secrets
- The JWT payload contains `"iss": "supabase-demo"` for local vs `"iss": "supabase"` with project ref for production
- It is **impossible** for a production Supabase project to accidentally have these keys

### Detection Module: `pkgs/edge-worker/src/shared/localDetection.ts`

Shared module used by PlatformAdapter to detect local environment:

```typescript
/**
 * Known local Supabase keys - identical across ALL local Supabase CLI installations.
 * Generated from fixed JWT_SECRET: 'super-secret-jwt-token-with-at-least-32-characters-long'
 * Source: https://supabase.com/docs/reference/cli/introduction
 */
export const KNOWN_LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const KNOWN_LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Detects if running on local Supabase by checking for known local keys.
 *
 * SAFETY: Returns false (production) unless keys EXACTLY match known local values.
 * This is cryptographically safe - production keys are unique per-project.
 *
 * Used by PlatformAdapter.isLocalEnvironment to determine compilation mode.
 */
export function isLocalSupabase(): boolean {
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  return anonKey === KNOWN_LOCAL_ANON_KEY ||
         serviceRoleKey === KNOWN_LOCAL_SERVICE_ROLE_KEY;
}
```

### Failure Modes (All Safe)

| Scenario | Detection Result | Consequence |
|----------|------------------|-------------|
| Standard local Supabase | `development` | Auto-recompile works |
| Hosted Supabase (production) | `production` | Safe - fails on mismatch |
| Self-hosted with custom JWT | `production` | Safe - expected behavior |
| User overrides local JWT_SECRET | `production` | Safe - inconvenience, not data loss |

### Edge Case: Custom Local Keys

If a user has overwritten their local `JWT_SECRET` in `config.toml`, detection will return `production` mode. This is **intentional** - we default to safety.

**Documentation note:** If users report "auto-compilation not working locally", check if they've customized JWT keys. This is expected behavior - safety over convenience.

---

## Architecture Overview

**Worker → SQL Function Directly**

```
Worker.start(MyFlow)
    │
    ├── extractFlowShape(flow) → shape
    │
    ├── Detect environment (PlatformAdapter.isLocalEnvironment)
    │      └── mode = isLocal ? 'development' : 'production'
    │
    └── Direct SQL call: pgflow.ensure_flow_compiled(slug, shape, mode)
        │
        └── SQL Function (TRANSACTIONAL)
            ├── Check if flow exists
            ├── If missing: compile, return 'compiled'
            ├── If exists: compare shapes
            ├── If match: return 'verified'
            ├── If different AND mode='development': recompile
            ├── If different AND mode='production': return 'mismatch'
            └── Return { status, differences[] }
```

### Worker Startup Flow

```
Worker.start(MyFlow)
    |
    v
extractFlowShape(flow) --> FlowShape
    |
    v
mode = PlatformAdapter.isLocalEnvironment ? 'development' : 'production'
    |
    v
sql`SELECT pgflow.ensure_flow_compiled(slug, shape, mode)`
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
 * FlowShape captures the structural definition of a flow for compilation.
 *
 * This represents the DAG topology - which steps exist, their types, how
 * they connect via dependencies, and their configuration options.
 *
 * Intentionally excluded:
 * - flowSlug: identifier, not structural data (comes from URL/context)
 */
export interface FlowShape {
  options?: FlowOptions;  // Flow-level options (maxAttempts, baseDelay, etc.)
  steps: StepShape[];
}

export interface StepShape {
  slug: string;
  stepType: 'single' | 'map';
  dependencies: string[];  // sorted alphabetically for deterministic comparison
  options?: StepOptions;   // Step-level options (maxAttempts, baseDelay, etc.)
}

export interface ShapeComparisonResult {
  match: boolean;
  differences: string[];
}

export function extractFlowShape(flow: AnyFlow): FlowShape;

// Used by SQL layer to compare shapes
export function compareFlowShapes(a: FlowShape, b: FlowShape): ShapeComparisonResult;
```

**Note:** Options are included in FlowShape for proper flow creation, but are excluded from
shape comparison. Users can tune options at runtime via SQL without recompilation.
See: `/deploy/tune-flow-config/`

### Export from `pkgs/dsl/src/index.ts`
- Add exports for `FlowShape`, `StepShape`, `ShapeComparisonResult`, `extractFlowShape`, `compareFlowShapes`

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

## Phase 3: Include Options in FlowShape

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

Worker configuration is simplified - mode detection happens via `PlatformAdapter.isLocalEnvironment` which checks for known local Supabase keys.

**Note:** No `compilationMode` config needed. Mode is auto-detected from environment. No `controlPlaneUrl` needed since compilation uses direct SQL calls.

---

## Phase 5: Worker Startup Integration

### Modify: `pkgs/edge-worker/src/flow/FlowWorkerLifecycle.ts`

Add compilation verification before `acknowledgeStart()`. Worker detects mode and calls SQL directly:

```typescript
private async ensureFlowCompiled(): Promise<void> {
  const mode = this.isLocalEnvironment ? 'development' : 'production';
  this.logger.info(`Compiling flow '${this.flow.slug}' (mode: ${mode})...`);

  const shape = extractFlowShape(this.flow);

  const result = await this.queries.ensureFlowCompiled(
    this.flow.slug,
    shape,
    mode
  );

  if (result.status === 'mismatch') {
    throw new FlowShapeMismatchError(this.flow.slug, result.differences);
  }

  this.logger.info(`Flow '${this.flow.slug}' ${result.status}`);
}
```

**Note:** Mode detection via `PlatformAdapter.isLocalEnvironment` - checks for known local Supabase keys.

### Modify: `pkgs/edge-worker/src/flow/createFlowWorker.ts`

Pass `isLocalEnvironment` from PlatformAdapter to FlowWorkerLifecycle:

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
| **DSL** | `pkgs/dsl/src/flow-shape.ts` | ✅ `FlowShape` interface + `extractFlowShape()` |
| **DSL** | `pkgs/dsl/src/index.ts` | ✅ Export new types/functions |
| **Core** | `pkgs/core/schemas/0100_function_ensure_flow_compiled.sql` | ✅ Main SQL function |
| **Core** | `pkgs/core/schemas/0100_function_get_flow_shape.sql` | ✅ Helper to query shape from DB |
| **Core** | `pkgs/core/schemas/0100_function_compare_flow_shapes.sql` | ✅ Shape comparison logic |
| **Core** | `pkgs/core/schemas/0100_function_create_flow_from_shape.sql` | ✅ Compile from JSONB |
| **Core** | `pkgs/core/schemas/0100_function_delete_flow_and_data.sql` | ✅ Full flow deletion |
| **Edge** | `pkgs/edge-worker/src/shared/localDetection.ts` | ✅ Known local keys + `isLocalSupabase()` |
| **Edge** | `pkgs/edge-worker/src/platform/SupabasePlatformAdapter.ts` | ✅ `isLocalEnvironment` property |
| **Edge** | `pkgs/edge-worker/src/flow/FlowWorkerLifecycle.ts` | ✅ `ensureFlowCompiled()` with direct SQL |
| **Edge** | `pkgs/edge-worker/src/flow/createFlowWorker.ts` | ✅ Pass isLocalEnvironment to lifecycle |
| **Edge** | `pkgs/edge-worker/src/core/Queries.ts` | ✅ `ensureFlowCompiled()` SQL query method |

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

### TDD Phase 3: Worker Integration (Vitest + E2E)

```
1. Write test: Worker calls ensureFlowCompiled SQL on startup
2. Implement ensureFlowCompiled() in FlowWorkerLifecycle
3. Write test: Worker throws FlowShapeMismatchError on mismatch
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
3. `FlowWorkerLifecycle` - Mode detection and error handling
4. `localDetection` - Known local key matching

### Integration Tests
1. Dev mode: Worker auto-compiles missing flow
2. Dev mode: Worker auto-recompiles when shape differs
3. Prod mode: Worker compiles missing flow (first deploy)
4. Prod mode: Worker fails when shape differs (with clear error)

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

### Phase 7: Worker Integration (~0.5 day)

**Order within phase:**
1. Add `isLocalEnvironment` to PlatformAdapter
2. Add `ensureFlowCompiled()` query method to Queries.ts
3. Implement `ensureFlowCompiled()` in FlowWorkerLifecycle
4. Wire up in `createFlowWorker()` - call before polling starts
5. Write integration tests

**Why last?**
- Depends on SQL function
- Direct SQL call (no HTTP layer)
- Integration tests validate entire stack

**Deliverable:** Workers auto-compile/verify at startup via direct SQL.

---

### Summary Timeline

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | DSL types + functions | ✅ Complete |
| 2 | Promote delete_flow_and_data | ✅ Complete |
| 3 | SQL _get_flow_shape | ✅ Complete |
| 4 | SQL _compare_flow_shapes | ✅ Complete |
| 5 | SQL _create_flow_from_shape | ✅ Complete |
| 6 | SQL ensure_flow_compiled | ✅ Complete |
| 7 | Worker integration (direct SQL) | ✅ Complete |
| 8 | Advisory locks | ⏳ To implement |

---

### Critical Checkpoints

**After Phase 3:** Verify `_get_flow_shape()` output matches TypeScript `extractFlowShape()` format exactly.

**After Phase 4:** Verify `_compare_flow_shapes()` produces identical differences to TypeScript `compareFlowShapes()`.

**After Phase 6:** Full SQL stack works - can compile, verify, recompile flows via direct SQL calls.

**After Phase 7:** End-to-end works - worker starts, calls SQL directly, gets verified/compiled.

---

## Resolved Design Decisions

1. **CLI `pgflow compile` command** - KEEP. Free to maintain, useful for migration files.
2. **Advisory locks** - YES. Required for concurrent worker startups. (To implement in Phase 8)
3. **Telemetry** - `created_at` already exists on `pgflow.flows`. Sufficient for MVP.
4. **pg_jsonschema validation** - SKIP. FlowShape generated by our code, not user input.
5. **Shape source** - Worker extracts shape from Flow, sends directly to SQL for comparison against DB.
6. **FlowShape location** - DSL package (alongside `compileFlow()`).
7. **FlowShape extensibility** - Version field for migrations. Future schemas (Zod) will be part of shape comparison.
8. **Compilation path** - Worker calls SQL directly (simpler than HTTP to ControlPlane).

---

## Advisory Lock Implementation (Phase 8 - To Implement)

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
