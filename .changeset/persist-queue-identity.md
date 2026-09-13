---
'@pgflow/core': minor
'@pgflow/dsl': minor
'@pgflow/client': minor
'@pgflow/edge-worker': minor
'pgflow': minor
---

Persist physical queue identity on steps and tasks. A queued task's message identity is now `(queue_name, message_id)`, not `message_id` alone, preparing pgflow for private per-step queues while keeping one-flow/one-queue behavior.

`pgflow.steps` and `pgflow.step_tasks` gain a canonical lowercase `queue_name` (snapshot at task creation), `(queue_name, message_id)` is unique per queue, and two flows can no longer share a normalized default queue. **Breaking:** `pgflow.start_tasks()` now requires the `queue_name` argument - the queue's canonical identity, `lower(flow_slug)` today - and the released three-argument form and the NULL default are gone, and `startTasks()` on `IPgflowClient`/`PgflowSqlClient` requires the queue argument as well. pgflow's own workers poll and claim through that canonical name; custom callers must pass it explicitly. There is no mixed-version rolling upgrade: stop and drain workers, pause producers and definition/maintenance/recovery writers, apply the transactional migration through Supabase's migration runner against the production database (`--linked` or `--db-url`, not the local default), replace the optional `prune_data_older_than()` helper, then deploy matching packages and workers together, restoring the exact worker `enabled` states recorded before the window (see the 0.17.0 upgrade guide). Message ids are exact decimal strings at the JavaScript boundary. Existing mixed-case queue names keep working through their original pgmq spelling - PGMQ's public message API normalizes names, so no message or queue migration is needed.
