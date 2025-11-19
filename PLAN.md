# PGMQ 1.5.1 Upgrade Plan

This document tracks the work needed to fully upgrade to PGMQ 1.5.1 and remove compatibility workarounds that are no longer needed.

## Context

### Current State
- **PGMQ Version**: 1.5.1 (confirmed via psql)
- **Supabase CLI**: v2.54.11
- **Postgres**: 17
- **Version Pin Removed**: Commit a71b371 removed PGMQ version constraint

### Why This Upgrade?

**PGMQ 1.5.0 Changes:**
- Added `headers` column to `message_record` type (now 6 columns: msg_id, read_ct, enqueued_at, vt, message, headers)
- Improved `read_with_poll` function with bug fixes

**Supabase Realtime v2.35.4+ Changes:**
- Fixed issue #1369: Janitor now creates partitions immediately on startup
- Auto-creates 7 partitions (3 days back, today, 3 days forward)
- **Verified**: After `db reset`, partitions are created automatically

### Breaking Changes
- Functions returning `SETOF pgmq.message_record` must return 6 columns (was 5)
- The `pgflow.read_with_poll` backport is obsolete
- The `pgflow_tests.create_realtime_partition` helper is obsolete

---

## [ ] Task 1: Fix set_vt_batch Function

**Priority**: HIGH (blocking 3 test files)

### Why
The function returns `SETOF pgmq.message_record` but only returns 5 columns. PGMQ 1.5.0+ expects 6 columns (added `headers`).

### Current Error
```
ERROR: structure of query does not match function result type
DETAIL: Number of returned columns (5) does not match expected column count (6).
```

### What to Change

**File**: `pkgs/core/schemas/0110_function_set_vt_batch.sql`

**Line 49-53**, change:
```sql
RETURNING q.msg_id,
          q.read_ct,
          q.enqueued_at,
          q.vt,
          q.message
```

To:
```sql
RETURNING q.msg_id,
          q.read_ct,
          q.enqueued_at,
          q.vt,
          q.message,
          q.headers
```

### Affected Tests
- `supabase/tests/set_vt_batch/basic_batch_update.test.sql`
- `supabase/tests/set_vt_batch/queue_security.test.sql`
- `supabase/tests/set_vt_batch/return_format.test.sql`

### Verification
```bash
./scripts/run-test-with-colors supabase/tests/set_vt_batch/*.test.sql
```

---

## [ ] Task 2: Remove read_with_poll Backport

**Priority**: MEDIUM (cleanup, not blocking)

### Why
The `pgflow.read_with_poll` function was a backport from PGMQ 1.5.0 with headers removed for 1.4.4 compatibility. The comment in the file says:

> "This is a backport of the pgmq.read_with_poll function from version 1.5.0. It is required because it fixes a bug with high CPU usage and Supabase is still using version 1.4.4. It is slightly modified (removed headers which are not available in 1.4.4). **This will be removed once Supabase upgrades to 1.5.0 or higher.**"

We're now on 1.5.1, so this should be removed.

### What to Delete

**File**: `pkgs/core/schemas/0080_function_read_with_poll.sql` (entire file)

### Migration Impact
**IMPORTANT**: Do NOT edit migration files manually. Existing migrations that reference this function will remain unchanged (they're historical).

The deletion of `schemas/0080_function_read_with_poll.sql` will cause Atlas to generate a `DROP FUNCTION pgflow.read_with_poll` statement in the new migration (Task 5).

Historical migrations that created this function:
- `supabase/migrations/20250429164909_pgflow_initial.sql` (CREATE FUNCTION statement)
- `supabase/migrations/20250517072017_pgflow_fix_poll_for_tasks_to_use_separate_statement_for_polling.sql` (DROP + CREATE)
- `supabase/migrations/20250627090700_pgflow_fix_function_search_paths.sql` (DROP + CREATE)

These remain untouched - migrations are append-only.

---

## [ ] Task 3: Update Code to Use pgmq.read_with_poll

**Priority**: MEDIUM (required after Task 2)

### Why
After removing `pgflow.read_with_poll`, code needs to call PGMQ's native `pgmq.read_with_poll()` instead.

### Affected Packages
- `pkgs/core` - SQL client + tests
- `pkgs/edge-worker` - Queue implementation

### What to Change

#### 3.1 Core Package - TypeScript Client

**File**: `pkgs/core/src/PgflowSqlClient.ts` (line 29)

Change:
```typescript
FROM pgflow.read_with_poll(
```

To:
```typescript
FROM pgmq.read_with_poll(
```

#### 3.2 Core Package - Test Files

The following test files call `pgflow.read_with_poll` and need updating:

**Location**: `pkgs/core/supabase/tests/start_tasks/`
```
builds_proper_input_from_deps_outputs.test.sql
multiple_task_processing.test.sql
returns_task_index.test.sql
started_at_timestamps.test.sql
status_transitions.test.sql
task_index_returned_correctly.test.sql
worker_tracking.test.sql
basic_start_tasks.test.sql
```

Bulk update command:
```bash
cd pkgs/core
rg -l "pgflow\.read_with_poll" supabase/tests/ | xargs sed -i 's/pgflow\.read_with_poll/pgmq.read_with_poll/g'
```

#### 3.3 Edge Worker Package - Queue Class

**File**: `pkgs/edge-worker/src/queue/Queue.ts` (line 82)

Change:
```typescript
return await this.sql<PgmqMessageRecord<TPayload>[]>`
  SELECT *
  FROM pgflow.read_with_poll(
    queue_name => ${this.queueName},
    vt => ${visibilityTimeout},
    qty => ${batchSize},
    max_poll_seconds => ${maxPollSeconds},
    poll_interval_ms => ${pollIntervalMs}
  );
`;
```

To:
```typescript
return await this.sql<PgmqMessageRecord<TPayload>[]>`
  SELECT *
  FROM pgmq.read_with_poll(
    queue_name => ${this.queueName},
    vt => ${visibilityTimeout},
    qty => ${batchSize},
    max_poll_seconds => ${maxPollSeconds},
    poll_interval_ms => ${pollIntervalMs}
  );
`;
```

### Verification

#### Verify Core Package
```bash
cd pkgs/core
./scripts/run-test-with-colors supabase/tests/start_tasks/*.test.sql
```

#### Verify Edge Worker Package
```bash
cd pkgs/edge-worker
pnpm nx test:unit edge-worker
pnpm nx test:integration edge-worker
```

---

## [ ] Task 4: Remove Realtime Partition Helpers

**Priority**: LOW (cleanup, not blocking)

### Why
Supabase Realtime v2.35.4+ fixed issue #1369. The janitor now creates partitions immediately on startup. **Verified**: After `pnpm supabase db reset`, 7 partitions are created automatically (3 days back, today, 3 days forward).

The helper function was a workaround that is no longer needed.

### What to Delete

#### 4.1 Helper Function

**File**: `supabase/seed.sql` (lines ~540-580)

Delete the entire `pgflow_tests.create_realtime_partition()` function definition.

#### 4.2 Helper Test File

**File**: `supabase/tests/pgflow_tests/create_realtime_partition.test.sql` (entire file)

This test fails with:
```
ERROR: must be owner of table messages_2025_11_02
```

The test tries to DROP partitions owned by `supabase_admin`, which causes permission errors. Since the helper is obsolete, delete the test.

#### 4.3 Remove Helper Calls from Tests

The following test files call `pgflow_tests.create_realtime_partition()` at the start:

```
supabase/tests/regressions/step_failed_event_bug.test.sql (line 5)
supabase/tests/realtime/start_ready_steps_events.test.sql (line 7)
supabase/tests/realtime/complete_task_events.test.sql (line 5)
supabase/tests/realtime/start_flow_events.test.sql (line 5)
supabase/tests/realtime/maybe_complete_run_events.test.sql (line 5)
supabase/tests/realtime/full_flow_events.test.sql (line 5)
supabase/tests/realtime/fail_task_events.test.sql (line 5)
supabase/tests/map_output_aggregation/broadcast_event_fixed.test.sql (line 11)
```

Remove the `select pgflow_tests.create_realtime_partition();` lines from all these files.

### Verification

#### Verify partitions auto-create:
```bash
pnpm supabase db reset
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "SELECT COUNT(*) as partition_count FROM pg_tables WHERE schemaname = 'realtime' AND tablename LIKE 'messages_%'"
```

Expected: ~7 partitions

#### Verify tests still pass:
```bash
./scripts/run-test-with-colors supabase/tests/realtime/*.test.sql
./scripts/run-test-with-colors supabase/tests/map_output_aggregation/broadcast_event_fixed.test.sql
./scripts/run-test-with-colors supabase/tests/regressions/step_failed_event_bug.test.sql
```

---

## [ ] Task 5: Generate Migration from Schema Changes

**Priority**: HIGH (required after schema changes)

### Why
Tasks 1 and 2 modify schema files in `pkgs/core/schemas/`. We need to generate a new migration from these schema changes. **NEVER manually edit migrations** - always generate them from schema files.

### Schema Files Modified
- `schemas/0110_function_set_vt_batch.sql` - Added `headers` column to RETURNING
- `schemas/0080_function_read_with_poll.sql` - Deleted (entire file)

### Migration Generation Process

Follow the workflow from `.claude/reference/schema_development.md`:

```bash
cd pkgs/core

# Generate migration from schema changes
./scripts/atlas-migrate-diff upgrade_pgmq_1_5_1  # NO pgflow_ prefix (auto-added)

# This creates: supabase/migrations/TIMESTAMP_pgflow_upgrade_pgmq_1_5_1.sql

# Verify migration is valid
pnpm nx verify-migrations core

# Test that migration applies cleanly
pnpm nx supabase:reset core
pnpm nx test:pgtap core
```

### Expected Migration Contents
The generated migration should contain:
- `DROP FUNCTION pgflow.read_with_poll(...)` - Removing backport
- Updated `CREATE FUNCTION pgflow.set_vt_batch(...)` - With `headers` in RETURNING clause
- Updated `atlas.sum` checksums

### Verification
```bash
# Clean slate test
pnpm nx supabase:reset core

# All tests should pass
pnpm nx test:pgtap core

# Specifically verify the previously failing tests
./scripts/run-test-with-colors supabase/tests/set_vt_batch/*.test.sql
```

All tests should pass after migrations are applied.

### Migration Sync to Other Packages

After generating the migration in core, it needs to be synced to other packages:

#### Auto-sync (via Nx tasks)
These packages automatically copy migrations from core when their Supabase tasks run:

**pkgs/client**
- Syncs via: `nx run client:supabase:prepare`
- Copies: `../core/supabase/migrations/*.sql` → `supabase/migrations/`
- Runs before: Supabase database operations

**pkgs/edge-worker**
- Syncs via: `nx run edge-worker:supabase:reset`
- Copies: `../core/supabase/migrations/*.sql` → `supabase/migrations/`
- Runs during: `pnpm nx supabase:reset edge-worker`

**No action needed** - these will pick up the new migration automatically on next run.

#### Manual sync required

**examples/playground**
- Has diverged migrations (not identical to core)
- No auto-sync mechanism
- Must manually copy the new migration file

```bash
# After generating migration in core, copy to playground
cp pkgs/core/supabase/migrations/*_pgflow_upgrade_pgmq_1_5_1.sql \
   examples/playground/supabase/migrations/
```

### Important Notes
- Migration name: `upgrade_pgmq_1_5_1` (Atlas auto-adds `pgflow_` prefix)
- Do NOT use `TEMP_` prefix (this is final migration for merging to main)
- Commit both schema changes AND generated migration together
- Remember to copy migration to playground manually

---

## [ ] Task 6: Update Documentation

**Priority**: LOW (good practice)

### What to Update

#### 6.1 CHANGELOG.md
Add entry under `[Unreleased]`:
```markdown
### Changed
- Upgraded to PGMQ 1.5.1, adding support for message headers
- Removed `pgflow.read_with_poll` backport (use `pgmq.read_with_poll` instead)
- Removed `pgflow_tests.create_realtime_partition` helper (partitions auto-created by Realtime v2.35.4+)

### Breaking Changes
- Requires PGMQ 1.5.0 or higher (Supabase ships 1.5.1 by default)
- Code calling `pgflow.read_with_poll` must update to `pgmq.read_with_poll`
```

#### 6.2 Documentation Files

Update references from `pgflow.read_with_poll` to `pgmq.read_with_poll` in:

**Website docs**:
- `pkgs/website/src/content/docs/reference/queue-worker/configuration.mdx`

**Architecture diagrams**:
- `pkgs/website/src/assets/architecture-diagrams/task-execution.mermaid`
- `pkgs/core/assets/flow-lifecycle.mermaid`
- `pkgs/core/assets/flow-lifecycle.svg`

**Guides**:
- `ARCHITECTURE_GUIDE.md`

**Package READMEs**:
- `pkgs/core/README.md`
- `pkgs/core/CHANGELOG.md`
- `pkgs/edge-worker/CHANGELOG.md`
- `pkgs/website/CHANGELOG.md`

Use global search to find all references:
```bash
rg "pgflow\.read_with_poll" --type md --type mermaid
```

#### 6.3 Migration Guide (if needed)
If this affects external users, add a migration guide to the website docs explaining:
- How to update from PGMQ 1.4.4 to 1.5.1
- What code changes are needed
- Why the breaking changes were made

---

## [ ] Task 7: Final Verification

**Priority**: CRITICAL (before merging)

### Full Test Suite
```bash
cd pkgs/core
pnpm nx test core
```

This runs:
- All pgTAP tests
- All Vitest tests
- Type checks

### Specific Regression Tests

#### 7.1 set_vt_batch
```bash
./scripts/run-test-with-colors supabase/tests/set_vt_batch/*.test.sql
```
Expected: All pass (previously failing)

#### 7.2 start_tasks (uses read_with_poll)
```bash
./scripts/run-test-with-colors supabase/tests/start_tasks/*.test.sql
```
Expected: All pass

#### 7.3 Realtime (no longer needs partition helper)
```bash
./scripts/run-test-with-colors supabase/tests/realtime/*.test.sql
```
Expected: All pass

### Edge Cases

#### Fresh Install Test
```bash
pnpm supabase db reset
# Immediately test realtime.send without waiting
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "SELECT realtime.send(jsonb_build_object('test', 'data'), 'test', 'test', false)"
# Check message was stored
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM realtime.messages WHERE payload->>'test' = 'data'"
```
Expected: Message successfully stored (partition exists)

---

## Summary Checklist

Before creating PR:
- [ ] All schema changes completed (Tasks 1-2)
- [ ] All code updates completed (Task 3)
- [ ] All cleanup completed (Task 4)
- [ ] Migrations regenerated (Task 5)
- [ ] Documentation updated (Task 6)
- [ ] All tests passing (Task 7)
- [ ] No references to `pgflow.read_with_poll` remain
- [ ] No references to `create_realtime_partition` remain
- [ ] Fresh `db reset` creates partitions automatically

## Files Changed Summary

### pkgs/core

**Modified**:
- `schemas/0110_function_set_vt_batch.sql` - Add headers column to RETURNING
- `src/PgflowSqlClient.ts` - Change pgflow.read_with_poll → pgmq.read_with_poll
- `supabase/tests/start_tasks/*.test.sql` (8 files) - Change pgflow.read_with_poll → pgmq.read_with_poll
- `supabase/tests/realtime/*.test.sql` (5 files) - Remove partition helper calls
- `supabase/tests/map_output_aggregation/broadcast_event_fixed.test.sql` - Remove partition helper call
- `supabase/tests/regressions/step_failed_event_bug.test.sql` - Remove partition helper call
- `CHANGELOG.md` - Document changes
- `README.md` - Update references
- `assets/flow-lifecycle.mermaid` - Update diagram
- `assets/flow-lifecycle.svg` - Update diagram

**Deleted**:
- `schemas/0080_function_read_with_poll.sql` - Backport no longer needed
- `supabase/tests/pgflow_tests/create_realtime_partition.test.sql` - Helper test obsolete
- `supabase/seed.sql` - Remove `create_realtime_partition` function (~40 lines)

**Generated**:
- New migration file via Atlas: `supabase/migrations/*_pgflow_upgrade_pgmq_1_5_1.sql`
- Updated `supabase/migrations/atlas.sum`

### pkgs/edge-worker

**Modified**:
- `src/queue/Queue.ts` - Change pgflow.read_with_poll → pgmq.read_with_poll (line 82)
- `CHANGELOG.md` - Document changes

**Auto-synced** (via Nx tasks):
- `supabase/migrations/*` - Auto-copied from core on `nx supabase:reset`

### pkgs/client

**Auto-synced** (via Nx tasks):
- `supabase/migrations/*` - Auto-copied from core on `nx supabase:prepare`

### pkgs/website

**Modified**:
- `src/content/docs/reference/queue-worker/configuration.mdx` - Update references
- `src/assets/architecture-diagrams/task-execution.mermaid` - Update diagram
- `CHANGELOG.md` - Document changes

### examples/playground

**Manual sync required**:
- `supabase/migrations/*_pgflow_upgrade_pgmq_1_5_1.sql` - Copy from core manually

### Root

**Modified**:
- `ARCHITECTURE_GUIDE.md` - Update references
