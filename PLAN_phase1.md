# Auto-Compilation Phase 1: MVP Basics

## Goal

Enable auto-compilation with conservative, simple logic. Ship quickly, safely.

---

## Core Principle

**Safety over Smartness**: Compare flow structure. Continue if match, drop+recreate (local) or fail (production) if mismatch.

---

## Behavior Matrix

| Environment | Flow Exists? | Shapes Match? | Action              | Result                      |
| ----------- | ------------ | ------------- | ------------------- | --------------------------- |
| Local       | No           | N/A           | Create fresh        | ✅ New flow                 |
| Local       | Yes          | **Match**     | Continue (noop)     | ✅ No changes needed        |
| Local       | Yes          | **Mismatch**  | Drop all → Recreate | ✅ Fresh state              |
| Production  | No           | N/A           | Create fresh        | ✅ First deployment         |
| Production  | Yes          | **Match**     | Continue (noop)     | ✅ No changes needed        |
| Production  | Yes          | **Mismatch**  | **RAISE EXCEPTION** | ❌ "Deploy migration first" |

**Key Logic**: Shape comparison determines if flow needs update. Only structure matters (slugs, indexes, types, deps), not options.

---

## Architecture

### Worker Code

```typescript
const flowShape = serializeFlow(flow); // Convert to JSON
await db.transaction(async (tx) => {
  await tx.execute('SELECT pgflow.ensure_flow_compiled($1, $2)', [
    flowShape,
    isLocal,
  ]);
});
```

### SQL Function

```sql
pgflow.ensure_flow_compiled(flow_shape jsonb, is_local bool) RETURNS jsonb
```

**Logic**:

1. Acquire advisory lock: `pg_advisory_xact_lock(hashtext('pgflow:' || slug))`
2. Check: `SELECT id FROM flows WHERE slug = ...`
3. Decision:
   - NOT exists → Create fresh (both envs)
   - Exists → Compare shapes
     - Match → Continue (noop)
     - Mismatch + is_local → Drop all, recreate
     - Mismatch + !is_local → RAISE EXCEPTION

**Shape comparison determines path!**

---

## Environment Detection

### Primary Check (Authoritative)

```typescript
const isLocal = !Boolean(
  Deno.env.get('DENO_DEPLOYMENT_ID') || Deno.env.get('SB_REGION')
);
```

### DB URL Validation (Warning Only)

```typescript
const dbUrl = Deno.env.get('EDGE_WORKER_DB_URL') || '';
const isSupabaseLocal =
  dbUrl.includes('localhost:54322') ||
  dbUrl.includes('127.0.0.1:54322') ||
  dbUrl.includes('localhost:54321');

// Warn but don't block
if (isLocal && dbUrl && !isSupabaseLocal) {
  console.warn(
    "[pgflow] DB URL doesn't match Supabase local pattern. Verify configuration!"
  );
}

if (!isLocal && isSupabaseLocal) {
  console.warn(
    '[pgflow] Production env vars but local DB URL. Configuration mismatch?'
  );
}
```

**Key Change**: Warnings not errors (supports Docker/custom setups).

---

## Queue Management

### Cleanup (drop_flow_data)

```sql
-- Check before dropping
FOR step_record IN SELECT slug FROM pgflow.steps WHERE flow_id = v_flow_id LOOP
  IF EXISTS(SELECT 1 FROM pgmq.list_queues() WHERE queue_name = step_record.slug) THEN
    PERFORM pgmq.drop_queue(step_record.slug);
  END IF;
END LOOP;
```

### Creation (Idempotent)

```sql
-- In worker or SQL
IF NOT EXISTS(SELECT 1 FROM pgmq.list_queues() WHERE queue_name = step_slug) THEN
  PERFORM pgmq.create_queue(step_slug);
END IF;
```

**Uses**: `pgmq.list_queues()`, `pgmq.drop_queue()`, `pgmq.create_queue()`

---

## Trade-offs

### What We Give Up (Phase 1)

- ❌ Local test data preserved (drops on mismatch)
- ❌ Production option-only updates (requires migration)

### What We Gain

- ✅ Shape comparison prevents unnecessary recreates
- ✅ No-op when flow unchanged (fast restarts!)
- ✅ Conservative, safe
- ✅ Clear error messages on mismatch
- ✅ Easy to test
- ✅ Ships quickly

**Decision**: Phase 1 includes shape comparison for safety and performance. Phase 2 adds option updates.

---

## SQL Functions

### Helper: compare_flow_shapes

```sql
CREATE FUNCTION pgflow.compare_flow_shapes(
  v_flow_id bigint,
  desired_shape jsonb
) RETURNS boolean AS $$
DECLARE
  current_shape jsonb;
BEGIN
  -- Extract current structure from DB (structural fields only, no options)
  SELECT jsonb_build_object(
    'slug', f.slug,
    'steps', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug', s.slug,
          'stepIndex', s.step_index,
          'stepType', s.step_type,
          'dependencies', COALESCE(
            (
              SELECT array_agg(parent_step.slug ORDER BY parent_step.step_index, parent_step.slug)
              FROM pgflow.deps d
              JOIN pgflow.steps parent_step ON parent_step.id = d.parent_step_id
              WHERE d.child_step_id = s.id
            ),
            ARRAY[]::text[]
          )
        )
        ORDER BY s.step_index, s.slug
      )
      FROM pgflow.steps s
      WHERE s.flow_id = f.id
    )
  ) INTO current_shape
  FROM pgflow.flows f
  WHERE f.id = v_flow_id;

  -- Strip options from desired shape for comparison
  desired_shape := jsonb_build_object(
    'slug', desired_shape->>'slug',
    'steps', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug', step->>'slug',
          'stepIndex', (step->>'stepIndex')::int,
          'stepType', step->>'stepType',
          'dependencies', step->'dependencies'
        )
      )
      FROM jsonb_array_elements(desired_shape->'steps') step
    )
  );

  -- Compare structural fields only
  RETURN current_shape = desired_shape;
END;
$$ LANGUAGE plpgsql;
```

### Main Function

```sql
CREATE FUNCTION pgflow.ensure_flow_compiled(flow_shape jsonb, is_local bool)
RETURNS jsonb AS $$
DECLARE
  v_slug text;
  v_flow_id bigint;
  lock_key bigint;
  shapes_match boolean;
BEGIN
  v_slug := flow_shape->>'slug';
  lock_key := hashtext('pgflow:' || v_slug);

  -- Advisory lock
  PERFORM pg_advisory_xact_lock(lock_key);

  -- Check existence
  SELECT id INTO v_flow_id FROM pgflow.flows WHERE slug = v_slug;

  IF v_flow_id IS NULL THEN
    -- New flow: create
    PERFORM pgflow.create_flow_from_shape(flow_shape);
    RETURN jsonb_build_object('status', 'created');
  ELSE
    -- Flow exists: compare shapes
    shapes_match := pgflow.compare_flow_shapes(v_flow_id, flow_shape);

    IF shapes_match THEN
      -- Shapes match: no action needed
      RETURN jsonb_build_object('status', 'unchanged');
    ELSE
      -- Shapes mismatch
      IF is_local THEN
        -- Local: drop and recreate
        PERFORM pgflow.drop_flow_data(v_slug);
        PERFORM pgflow.create_flow_from_shape(flow_shape);
        RETURN jsonb_build_object('status', 'recreated');
      ELSE
        -- Production: fail
        RAISE EXCEPTION 'Flow ''%'' structure mismatch. Deploy migration first (pgflow compile).', v_slug;
      END IF;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### Helper: drop_flow_data

```sql
CREATE FUNCTION pgflow.drop_flow_data(p_flow_slug text)
RETURNS void AS $$
DECLARE
  v_flow_id bigint;
  step_rec record;
BEGIN
  SELECT id INTO v_flow_id FROM pgflow.flows WHERE slug = p_flow_slug;
  IF v_flow_id IS NULL THEN RETURN; END IF;

  -- Drop queues (idempotent)
  FOR step_rec IN SELECT slug FROM pgflow.steps WHERE flow_id = v_flow_id LOOP
    IF EXISTS(SELECT 1 FROM pgmq.list_queues() WHERE queue_name = step_rec.slug) THEN
      PERFORM pgmq.drop_queue(step_rec.slug);
    END IF;
  END LOOP;

  -- Delete data (CASCADE handles deps, step_states)
  DELETE FROM pgflow.steps WHERE flow_id = v_flow_id;
  DELETE FROM pgflow.runs WHERE flow_id = v_flow_id;
END;
$$ LANGUAGE plpgsql;
```

### Helper: create_flow_from_shape

```sql
CREATE FUNCTION pgflow.create_flow_from_shape(flow_shape jsonb)
RETURNS bigint AS $$
DECLARE
  v_flow_id bigint;
  v_slug text;
  step_json jsonb;
BEGIN
  -- Extract flow properties
  v_slug := flow_shape->>'slug';

  -- Create flow
  INSERT INTO pgflow.flows (
    slug,
    max_attempts,
    base_delay,
    timeout
  ) VALUES (
    v_slug,
    COALESCE((flow_shape->'options'->>'maxAttempts')::int, 3),
    COALESCE((flow_shape->'options'->>'baseDelay')::int, 5),
    COALESCE((flow_shape->'options'->>'timeout')::int, 30)
  ) RETURNING id INTO v_flow_id;

  -- Create steps
  FOR step_json IN SELECT * FROM jsonb_array_elements(flow_shape->'steps')
  LOOP
    PERFORM pgflow.create_step_from_json(v_flow_id, step_json);
  END LOOP;

  RETURN v_flow_id;
END;
$$ LANGUAGE plpgsql;
```

### Helper: create_step_from_json

```sql
CREATE FUNCTION pgflow.create_step_from_json(v_flow_id bigint, step_json jsonb)
RETURNS bigint AS $$
DECLARE
  v_step_id bigint;
  v_step_slug text;
  dep_slug text;
BEGIN
  v_step_slug := step_json->>'slug';

  -- Create step
  INSERT INTO pgflow.steps (
    flow_id,
    slug,
    step_index,
    step_type,
    max_attempts,
    base_delay,
    timeout,
    start_delay
  ) VALUES (
    v_flow_id,
    v_step_slug,
    (step_json->>'stepIndex')::int,
    step_json->>'stepType',
    (step_json->'options'->>'maxAttempts')::int,
    (step_json->'options'->>'baseDelay')::int,
    (step_json->'options'->>'timeout')::int,
    (step_json->'options'->>'startDelay')::int
  ) RETURNING id INTO v_step_id;

  -- Create dependencies
  IF step_json->'dependencies' IS NOT NULL THEN
    FOR dep_slug IN SELECT jsonb_array_elements_text(step_json->'dependencies')
    LOOP
      INSERT INTO pgflow.deps (parent_step_id, child_step_id)
      SELECT parent.id, v_step_id
      FROM pgflow.steps parent
      WHERE parent.flow_id = v_flow_id AND parent.slug = dep_slug;
    END LOOP;
  END IF;

  RETURN v_step_id;
END;
$$ LANGUAGE plpgsql;
```

---

## TypeScript Implementation

### serializeFlow()

```typescript
interface FlowShape {
  slug: string;
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    timeout?: number;
  };
  steps: StepShape[];
}

interface StepShape {
  slug: string;
  stepIndex: number;
  stepType: string;
  dependencies: string[]; // Sorted alphabetically
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    timeout?: number;
    startDelay?: number;
  };
}

function serializeFlow(flow: AnyFlow): FlowShape {
  return {
    slug: flow.slug,
    options: flow.options,
    steps: flow.stepOrder.map((stepSlug) => {
      const step = flow.getStepDefinition(stepSlug);

      // Sort dependencies by stepIndex, then slug for deterministic comparison
      const sortedDependencies = [...step.dependencies].sort((a, b) => {
        const aStep = flow.getStepDefinition(a);
        const bStep = flow.getStepDefinition(b);

        // First by stepIndex (topological order)
        if (aStep.stepIndex !== bStep.stepIndex) {
          return aStep.stepIndex - bStep.stepIndex;
        }

        // Then by slug (lexicographic)
        return a.localeCompare(b);
      });

      return {
        slug: step.slug,
        stepIndex: step.stepIndex,
        stepType: step.stepType,
        dependencies: sortedDependencies,
        options: step.options,
      };
    }),
  };
}
```

---

## HTTP Compilation Endpoint

**Same as original plan** - no changes needed.

```
GET /functions/v1/<worker>/compile?check_after=<mtime>

Response 200: { sql: string[], flow_slug: string }
Response 409: { error: "stale_worker", ... }
```

CLI command unchanged:

```bash
pgflow compile flows/my-flow.ts
```

---

## Workflows

### Local Development - No Changes

```
1. Restart worker (flow code unchanged)
2. Worker calls: ensure_flow_compiled(flowShape, is_local=true)
3. Shapes match → Continue (noop)
4. Ready (test data preserved!)
```

**Benefit**: Fast restarts when flow unchanged!

### Local Development - Structure Change

```
1. Edit flow code (add step, change deps, etc.)
2. Restart worker
3. Worker calls: ensure_flow_compiled(flowShape, is_local=true)
4. Shapes mismatch → DROPS everything, recreates
5. Ready (fresh state)
```

**Trade-off**: Loses test data on structure change. Acceptable for Phase 1.

### Production (New Flow)

```
1. Deploy worker
2. Worker calls: ensure_flow_compiled(flowShape, is_local=false)
3. Flow doesn't exist → Creates
4. Ready
```

### Production (Existing Flow - No Changes)

```
1. Redeploy worker (flow code unchanged)
2. Worker calls: ensure_flow_compiled(flowShape, is_local=false)
3. Shapes match → Continue (noop)
4. Ready
```

**Benefit**: Safe redeployments don't require migrations!

### Production (Existing Flow - ANY Change)

```
1. Deploy updated worker (structure or options changed)
2. Worker calls: ensure_flow_compiled(flowShape, is_local=false)
3. Shapes mismatch → FAILS
4. Developer generates migration: pgflow compile
5. Deploy migration: supabase db push
6. Redeploy worker
7. Ready
```

**Trade-off**: Even option-only changes require migration. Phase 2 will improve this.

---

## Implementation Checklist

### SQL

- [ ] `pgflow.compare_flow_shapes(flow_id, flow_shape)` - structure comparison
- [ ] `pgflow.ensure_flow_compiled(flow_shape, is_local)` - main function with shape comparison
- [ ] `pgflow.drop_flow_data(slug)` - cleanup with pgmq.list_queues
- [ ] `pgflow.create_flow_from_shape(flow_shape)` - parse JSON, create
- [ ] `pgflow.create_step_from_json(flow_id, step_json)` - step creation helper
- [ ] Update queue creation to be idempotent (IF NOT EXISTS check)

### TypeScript

- [ ] `serializeFlow(flow)` - convert Flow to JSON with sorted dependencies
- [ ] Environment detection (Supabase env vars + DB URL warning)
- [ ] Worker integration in `EdgeWorker.acknowledgeStart()`
- [ ] HTTP `/compile` endpoint with staleness check
- [ ] Update `compileFlow()` to include `step_index` parameter

### CLI

- [ ] `pgflow compile <flow-file>` command
- [ ] Worker name inference (basename + "-worker")
- [ ] URL discovery via `supabase status`
- [ ] Migration file generation

---

## What Phase 2 Will Add

Phase 2 enhancements (not in Phase 1):

- Update runtime options without dropping data (preserve test data!)
- Production option-only updates (no migration needed!)
- Optional strict mode (PGFLOW_REQUIRE_MIGRATIONS env var)

**Phase 1 is complete without these.** Ship Phase 1, iterate to Phase 2.

---

## Success Criteria

Phase 1 is successful when:

- ✅ Local dev: Edit → Restart → Ready (no manual pgflow compile)
- ✅ Production: Explicit migrations enforced (fails if flow exists)
- ✅ Multi-worker: No race conditions (advisory locks work)
- ✅ HTTP compile: CLI can generate migrations
- ✅ Queue cleanup: No orphaned queues
- ✅ Environment detection: Reliable, warns on unexpected configs

**Ship Phase 1, then enhance with Phase 2!**
