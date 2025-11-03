---
'@pgflow/client': patch
'@pgflow/core': patch
---

Fix missing realtime broadcasts for step:started and step:completed events

**Critical bug fix:** Clients were not receiving `step:started` events when steps transitioned to Started status, and `step:completed` events for empty map steps and cascade completions were also missing.

**Root cause:** PostgreSQL query optimizer was eliminating CTEs containing `realtime.send()` calls because they were not referenced by subsequent operations or the final RETURN statement.

**Solution:** Moved `realtime.send()` calls directly into RETURNING clauses of UPDATE statements, ensuring they execute atomically with state changes and cannot be optimized away.

**Changes:**
- `start_ready_steps()`: Broadcasts step:started and step:completed events in RETURNING clauses
- `cascade_complete_taskless_steps()`: Broadcasts step:completed events atomically with cascade completion
- `complete_task()`: Added PERFORM statements for run:failed and step:failed broadcasts
- Client: Added `applySnapshot()` methods to FlowRun and FlowStep for proper initial state hydration without event emission
