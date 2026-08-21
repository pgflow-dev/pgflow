---
"@pgflow/core": patch
---

Terminalize queued and started task rows when their parent step is skipped: sibling tasks of a step skipped via `whenExhausted: 'skip'`/`'skip-cascade'` (and cascade-skipped steps) now end as `skipped` instead of staying `queued`/`started` forever, and a migration repairs existing rows.

Tasks are now terminalized before their queue messages are archived, preserving the task-before-queue lock order, and `start_tasks` only returns rows it actually claimed, so workers no longer execute tasks a concurrent skip already marked `skipped`.

Fixes #638
