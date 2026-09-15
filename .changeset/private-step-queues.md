---
'@pgflow/core': minor
'@pgflow/dsl': minor
'@pgflow/edge-worker': minor
---

Add private per-step queues. Wrap a flow with `withStepQueues()` and start one `EdgeWorker` per selected `stepSlug`; pgflow derives, validates, persists, and verifies each route before dispatching work.

Flow and step slugs now reject leading or trailing underscores and `__`. Flow slugs are case-insensitively unique, and step slugs are case-insensitively unique within a flow.

**Breaking:** `Flow.stepOrder` is now `readonly` and frozen at construction, so mutating it (for example `push()` or `reverse()`) can no longer change a flow's shape — startup shape extraction and checked route indices must never diverge.
