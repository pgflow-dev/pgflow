---
'@pgflow/edge-worker': minor
'@pgflow/website': minor
'@pgflow/core': minor
---

Replace single-phase polling with two-phase approach to eliminate race conditions

**Breaking Change**: The `poll_for_tasks` function is now deprecated and returns an empty set. Edge workers must be updated to use the new two-phase polling mechanism.

**What Changed:**

- Added new "started" status for step_tasks with `started_at` timestamp and `last_worker_id` tracking
- Introduced `start_tasks` function for the second phase of task processing
- Edge worker now uses two-phase approach: first `read_with_poll` to get messages, then `start_tasks` to process them
- This eliminates race conditions where tasks might not be visible when processing messages

**Migration Instructions:**

1. Run `npx pgflow install` to apply database migrations and update dependencies
2. Redeploy your edge workers - they will automatically use the new polling mechanism
3. Old workers will continue running but won't process any tasks (safe degradation)

**Why This Change:**
The previous `poll_for_tasks` had subtle race conditions on slower systems where messages could be read but matching step_tasks weren't visible in the same transaction, leading to lost work. The new two-phase approach provides stronger guarantees and better observability.
