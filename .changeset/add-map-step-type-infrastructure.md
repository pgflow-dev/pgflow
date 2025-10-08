---
'@pgflow/core': minor
---

Add map step type infrastructure in SQL core

⚠️ **This migration includes automatic data migration**

The migration will automatically update existing `step_states` rows to satisfy new constraints. This should complete without issues due to strict check constraints enforced in previous versions.

💡 **Recommended: Verify before deploying to production**

If you have existing production data and want to verify the migration will succeed cleanly, run this **read-only check query** (does not modify data) in **Supabase Studio** against your **production database**:

1. Open Supabase Studio → SQL Editor
2. Copy contents of `pkgs/core/queries/PRE_MIGRATION_CHECK_20251006073122.sql`
3. Execute against your production database (not local dev!)
4. Review results

**Expected output for successful migration:**

```
type                       | identifier                | details
---------------------------|---------------------------|------------------------------------------
DATA_BACKFILL_STARTED      | run=def67890 step=process | initial_tasks will be set to 1 (...)
DATA_BACKFILL_COMPLETED    | Found 100 completed steps | initial_tasks will be set to 1 (...)
INFO_SUMMARY               | total_step_states=114     | created=0 started=1 completed=113 failed=0
```

**Interpretation:**

- ✅ Only `DATA_BACKFILL_*` and `INFO_SUMMARY` rows? **Safe to migrate**
- ⚠️ These are expected data migrations handled automatically by the migration
- 🆘 Unexpected rows or errors? Copy output and share on Discord for help

📝 **Note:** This check identifies data that needs migration but does not modify anything. Only useful for production databases with existing runs.

**Automatic data updates:**

- Sets `initial_tasks = 1` for all existing steps (correct for pre-map-step schema)
- Sets `remaining_tasks = NULL` for 'created' status steps (new semantics)

No manual intervention required.

---

## Changes

This patch introduces the foundation for map step functionality in the SQL core layer:

### Schema Changes

- Added `step_type` column to `steps` table with constraint allowing 'single' or 'map' values
- Added `initial_tasks` column to `step_states` table (defaults to 1, stores planned task count)
- Modified `remaining_tasks` column to be nullable (NULL = not started, >0 = active countdown)
- Added constraint `remaining_tasks_state_consistency` to ensure `remaining_tasks` is only set when step has started
- Removed `only_single_task_per_step` constraint from `step_tasks` table to allow multiple tasks per step

### Function Updates

- **`add_step()`**: Now accepts `step_type` parameter (defaults to 'single') with validation that map steps can have at most 1 dependency
- **`start_flow()`**: Sets `initial_tasks = 1` for all steps (map step array handling will come in future phases)
- **`start_ready_steps()`**: Copies `initial_tasks` to `remaining_tasks` when starting a step, maintaining proper task counting semantics

### Testing

- Added comprehensive test coverage for map step creation and validation
- All existing tests pass with the new schema changes
- Tests validate the new step_type parameter and dependency constraints for map steps

This is Phase 2a of the map step implementation, establishing the SQL infrastructure needed for parallel task execution in future phases.
