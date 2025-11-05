# Auto-Compilation Phase 2: Option Updates

## Goal

Add intelligent option updates to preserve data and enable production option changes without migrations.

---

## Core Principle

**Smart Updates over Drop+Recreate**: When flow structure matches, update options only. Preserve all data, queues, and runs.

---

## Behavior Matrix (Phase 2 vs Phase 1)

| Environment | Flow Exists? | Shapes Match? | Phase 1 Action  | Phase 2 Action     | Improvement         |
| ----------- | ------------ | ------------- | --------------- | ------------------ | ------------------- |
| Local       | No           | N/A           | Create fresh    | Create fresh       | Same                |
| Local       | Yes          | **Match**     | Continue (noop) | **Update options** | ✅ Options updated! |
| Local       | Yes          | **Mismatch**  | Drop → Recreate | Drop → Recreate    | Same                |
| Production  | No           | N/A           | Create fresh    | Create fresh       | Same                |
| Production  | Yes          | **Match**     | Continue (noop) | **Update options** | ✅ No migration!    |
| Production  | Yes          | **Mismatch**  | RAISE EXCEPTION | RAISE EXCEPTION    | Same                |

**Key Enhancement**: When shapes match, Phase 2 updates options instead of no-op. This preserves data while applying config changes!

---

## Architecture

### Worker Code (Same as Phase 1)

```typescript
const flowShape = serializeFlow(flow); // Convert to JSON
await db.transaction(async (tx) => {
  await tx.execute('SELECT pgflow.ensure_flow_compiled($1, $2)', [
    flowShape,
    isLocal,
  ]);
});
```

### SQL Function (Enhanced)

```sql
pgflow.ensure_flow_compiled(flow_shape jsonb, is_local bool) RETURNS jsonb
```

**Logic**:

1. Acquire advisory lock: `pg_advisory_xact_lock(hashtext('pgflow:' || slug))`
2. Check: `SELECT id FROM flows WHERE slug = ...`
3. Decision:
   - NOT exists → Create fresh (both envs)
   - Exists → Compare shapes
     - Match + is_local → Update options, preserve data
     - Match + !is_local → Update options, preserve data
     - Mismatch + is_local → Drop all, recreate
     - Mismatch + !is_local → RAISE EXCEPTION

**Shape comparison in Phase 1!**

---

## Option Updates (Phase 2 Addition)

### Update Flow Options

```sql
CREATE FUNCTION pgflow.update_flow_options(
  v_flow_id bigint,
  flow_shape jsonb
) RETURNS void AS $$
BEGIN
  UPDATE pgflow.flows
  SET
    max_attempts = COALESCE((flow_shape->'options'->>'maxAttempts')::int, max_attempts),
    base_delay = COALESCE((flow_shape->'options'->>'baseDelay')::int, base_delay),
    timeout = COALESCE((flow_shape->'options'->>'timeout')::int, timeout)
  WHERE id = v_flow_id;
END;
$$ LANGUAGE plpgsql;
```

### Update Step Options

```sql
CREATE FUNCTION pgflow.update_step_options(
  v_flow_id bigint,
  flow_shape jsonb
) RETURNS void AS $$
DECLARE
  step_json jsonb;
  v_step_slug text;
BEGIN
  FOR step_json IN SELECT * FROM jsonb_array_elements(flow_shape->'steps')
  LOOP
    v_step_slug := step_json->>'slug';

    UPDATE pgflow.steps
    SET
      max_attempts = (step_json->'options'->>'maxAttempts')::int,
      base_delay = (step_json->'options'->>'baseDelay')::int,
      timeout = (step_json->'options'->>'timeout')::int,
      start_delay = (step_json->'options'->>'startDelay')::int
    WHERE flow_id = v_flow_id AND slug = v_step_slug;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

**Preserves**: All data, queues, runs, step_states.

---

## Enhanced Main Function

### pgflow.ensure_flow_compiled (Phase 2 Version)

```sql
CREATE FUNCTION pgflow.ensure_flow_compiled(flow_shape jsonb, is_local bool)
RETURNS jsonb AS $$
DECLARE
  v_slug text;
  v_flow_id bigint;
  lock_key bigint;
  shapes_match boolean;
  require_migrations boolean;
BEGIN
  v_slug := flow_shape->>'slug';
  lock_key := hashtext('pgflow:' || v_slug);
  require_migrations := COALESCE(current_setting('pgflow.require_migrations', true)::boolean, false);

  -- Advisory lock
  PERFORM pg_advisory_xact_lock(lock_key);

  -- Check existence
  SELECT id INTO v_flow_id FROM pgflow.flows WHERE slug = v_slug;

  IF v_flow_id IS NULL THEN
    -- New flow
    IF require_migrations AND NOT is_local THEN
      -- Strict mode: even new flows require migration
      RAISE EXCEPTION 'Flow ''%'' does not exist. Deploy migration first (PGFLOW_REQUIRE_MIGRATIONS=true).', v_slug;
    END IF;

    PERFORM pgflow.create_flow_from_shape(flow_shape);
    RETURN jsonb_build_object('status', 'created');
  ELSE
    -- Flow exists: compare shapes
    shapes_match := pgflow.compare_flow_shapes(v_flow_id, flow_shape);

    IF shapes_match THEN
      -- Structure matches: update options only
      PERFORM pgflow.update_flow_options(v_flow_id, flow_shape);
      PERFORM pgflow.update_step_options(v_flow_id, flow_shape);
      RETURN jsonb_build_object('status', 'options_updated');
    ELSE
      -- Structure mismatch
      IF is_local THEN
        -- Local: drop and recreate
        PERFORM pgflow.drop_flow_data(v_slug);
        PERFORM pgflow.create_flow_from_shape(flow_shape);
        RETURN jsonb_build_object('status', 'recreated');
      ELSE
        -- Production: fail with details
        RAISE EXCEPTION 'Flow ''%'' structure mismatch. Deploy migration first.', v_slug;
      END IF;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

**Key Changes**:

- Shape comparison determines path
- Options updates preserve data
- Strict mode check for new flows
- Same advisory locking as Phase 1

---

## Strict Mode (PGFLOW_REQUIRE_MIGRATIONS)

### Configuration

```sql
-- Set via PostgreSQL config
ALTER DATABASE postgres SET pgflow.require_migrations = 'true';

-- Or per-transaction
SET pgflow.require_migrations = 'true';
```

### Behavior

When `pgflow.require_migrations = true`:

- **New flows in production**: RAISE EXCEPTION (must deploy migration first)
- **New flows in local**: Still auto-create (development convenience)
- **Existing flows**: Same behavior as without strict mode

**Use Case**: Organizations requiring audit trail for ALL flow definitions.

---

## Environment Detection

**Same as Phase 1** - no changes needed.

```typescript
const isLocal = !Boolean(
  Deno.env.get('DENO_DEPLOYMENT_ID') || Deno.env.get('SB_REGION')
);

// DB URL validation (warnings only)
const dbUrl = Deno.env.get('EDGE_WORKER_DB_URL') || '';
const isSupabaseLocal =
  dbUrl.includes('localhost:54322') ||
  dbUrl.includes('127.0.0.1:54322') ||
  dbUrl.includes('localhost:54321');

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

---

## Queue Management

**Same as Phase 1** - no changes needed.

```sql
-- Cleanup (drop_flow_data)
FOR step_record IN SELECT slug FROM pgflow.steps WHERE flow_id = v_flow_id LOOP
  IF EXISTS(SELECT 1 FROM pgmq.list_queues() WHERE queue_name = step_record.slug) THEN
    PERFORM pgmq.drop_queue(step_record.slug);
  END IF;
END LOOP;

-- Creation (Idempotent)
IF NOT EXISTS(SELECT 1 FROM pgmq.list_queues() WHERE queue_name = step_slug) THEN
  PERFORM pgmq.create_queue(step_slug);
END IF;
```

---

## What Phase 2 Adds Over Phase 1

### New Capabilities

- ✅ Option update functions (flow and step options)
- ✅ Preserve data when only options change (no drops!)
- ✅ Update production runtime options (no migration needed!)
- ✅ Strict mode for compliance (PGFLOW_REQUIRE_MIGRATIONS)

### Behavioral Improvements

- ✅ Local dev: Change timeout → Just update (data preserved!)
- ✅ Production: Change timeout → Just update (no migration!)
- ✅ Production: Add step → Still requires migration (safe!)
- ✅ Better DX: Fewer unnecessary drops, faster iteration

### Backward Compatibility

- ✅ Worker code unchanged (same serializeFlow call)
- ✅ HTTP /compile endpoint unchanged
- ✅ CLI command unchanged
- ✅ Migration format unchanged

**Phase 2 is drop-in enhancement!**

---

## Workflows

### Local Development - Option Change (NEW!)

```
1. Edit flow code (change timeout: 30 → 60)
2. Restart worker
3. Worker calls: ensure_flow_compiled(flowShape, is_local=true)
   - Shapes match: UPDATES options only
   - Data preserved: runs, step_states, queues intact
4. Ready (same test data, updated config)
```

**Benefit**: No more losing test data for option tweaks!

### Local Development - Structure Change

```
1. Edit flow code (add new step)
2. Restart worker
3. Worker calls: ensure_flow_compiled(flowShape, is_local=true)
   - Shapes mismatch: DROPS everything, recreates
4. Ready (fresh state, new structure)
```

**Same as Phase 1** when structure changes.

### Production - Option Change (NEW!)

```
1. Deploy updated worker (timeout changed)
2. Worker calls: ensure_flow_compiled(flowShape, is_local=false)
3. Shapes match → Updates options
4. Ready (no migration needed!)
```

**Benefit**: Fast deploys for config changes!

### Production - Structure Change

```
1. Deploy updated worker (new step added)
2. Worker calls: ensure_flow_compiled(flowShape, is_local=false)
3. Shapes mismatch → FAILS
4. Developer generates migration: pgflow compile
5. Deploy migration: supabase db push
6. Redeploy worker
7. Ready
```

**Same as Phase 1** when structure changes (safe!).

---

## Implementation Checklist

### SQL (New Functions)

- [ ] `pgflow.update_flow_options(flow_id, flow_shape)` - flow option updates
- [ ] `pgflow.update_step_options(flow_id, flow_shape)` - step option updates
- [ ] Update `pgflow.ensure_flow_compiled()` to call update functions when shapes match
- [ ] Add `pgflow.require_migrations` config parameter support

### SQL (Phase 1 Functions - Already Implemented)

- [x] `pgflow.compare_flow_shapes(flow_id, flow_shape)` - use existing from Phase 1
- [x] `pgflow.drop_flow_data(slug)` - no changes needed
- [x] `pgflow.create_flow_from_shape(flow_shape)` - no changes needed
- [x] `pgflow.create_step_from_json(flow_id, step_json)` - no changes needed

### TypeScript (No Changes)

- [x] `serializeFlow(flow)` - same as Phase 1
- [x] Environment detection - same as Phase 1
- [x] Worker integration - same as Phase 1
- [x] HTTP `/compile` endpoint - same as Phase 1

### Testing

- [ ] Test option updates (flow and step)
- [ ] Test strict mode (PGFLOW_REQUIRE_MIGRATIONS)
- [ ] Test backward compatibility with Phase 1
- [ ] Test local data preservation on option changes

---

## Success Criteria

Phase 2 is successful when:

- ✅ Local dev: Option changes preserve test data
- ✅ Production: Option changes deploy without migration
- ✅ Production: Structure changes still require migration (safety maintained)
- ✅ Strict mode: Organizations can require migrations for all changes
- ✅ Backward compatible: Drop-in replacement for Phase 1
- ✅ Same advisory lock protection (no race conditions)
- ✅ Option updates are accurate and complete

**Phase 2 builds on Phase 1's shape comparison foundation!**

---

## Migration from Phase 1

### Database Migration

```sql
-- Add new functions (Phase 2)
CREATE FUNCTION pgflow.update_flow_options(...) ...;
CREATE FUNCTION pgflow.update_step_options(...) ...;

-- Update main function to call update functions when shapes match
CREATE OR REPLACE FUNCTION pgflow.ensure_flow_compiled(...) ...;

-- compare_flow_shapes already exists from Phase 1!
```

### No Code Changes Required

- Worker code: Same serializeFlow() call
- CLI: Same pgflow compile command
- HTTP endpoint: Same /compile response

### Rollback Plan

```sql
-- Restore Phase 1 version
CREATE OR REPLACE FUNCTION pgflow.ensure_flow_compiled(...)
... -- Phase 1 implementation
```

**Zero breaking changes!**

---

## Trade-offs Analysis

### What Phase 2 Adds

- ✅ Smarter local development (data preservation)
- ✅ Faster production deploys (option updates)
- ✅ Better developer experience
- ✅ Compliance mode (strict migrations)

### What Phase 2 Costs

- ⚠️ More complex SQL logic (shape comparison)
- ⚠️ More test surface area
- ⚠️ Slightly higher cognitive load

### When to Use Phase 2

- ✅ After Phase 1 is stable and validated
- ✅ When teams iterate frequently on flow options
- ✅ When preserving local test data is valuable
- ✅ When compliance requires strict migration control

**Decision**: Phase 2 is enhancement, not replacement. Phase 1 is complete and shippable without Phase 2.
