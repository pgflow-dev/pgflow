---
'@pgflow/core': minor
'@pgflow/dsl': minor
'@pgflow/client': minor
'@pgflow/edge-worker': minor
'pgflow': minor
---

Persist physical queue identity on steps and tasks. A queued task's message identity is now `(queue_name, message_id)`, not `message_id` alone, preparing pgflow for private per-step queues while keeping one-flow/one-queue behavior.

`pgflow.steps` and `pgflow.step_tasks` gain a canonical lowercase `queue_name` (snapshot at task creation), `(queue_name, message_id)` is unique per queue, and two flows can no longer share a normalized default queue. `pgflow.start_tasks()` claims by the polled queue and keeps its released three-argument signature; message ids are exact decimal strings at the JavaScript boundary. Existing mixed-case queue names keep working through their original pgmq spelling, and the optional `prune_data_older_than()` snippet now cleans messages through task snapshots; replace any installed copy with the current one.

The database migration backfills existing steps and tasks and fails atomically on conflicting definitions: stop and drain workers, pause producers and definition/maintenance writers, then apply it through Supabase's migration runner and deploy the matching packages together.
