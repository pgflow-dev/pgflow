---
'@pgflow/core': patch
---

Add map step type infrastructure in SQL core

## 🚨🚨🚨 CRITICAL MIGRATION WARNING 🚨🚨🚨

**THIS MIGRATION REQUIRES MANUAL DATA UPDATE BEFORE DEPLOYMENT!**

The migration adds a new constraint `remaining_tasks_state_consistency` that will **FAIL ON EXISTING DATA** if not handled properly.

### Required Data Migration:

Before applying this migration to any environment with existing data, you MUST include:

```sql
-- CRITICAL: Update existing step_states to satisfy new constraint
UPDATE pgflow.step_states 
SET remaining_tasks = NULL 
WHERE status = 'created';
```

**Without this update, the migration WILL FAIL in production!** The new constraint requires that `remaining_tasks` can only be set when `status != 'created'`.

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