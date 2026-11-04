---
"@pgflow/core": minor
---

Terminalize permanently stalled tasks through the step's `whenExhausted` policy. A new `pgflow.escalate_permanently_stalled()` function, scheduled as its own `pgflow_escalate_permanently_stalled` cron job, hands tasks marked with `permanently_stalled_at` to `fail_task()`, which now treats the marker as exhaustion regardless of remaining attempts: the run fails, the step skips or cascades per policy, dependents start, and siblings are cancelled or archived. `attempts_count` stays untouched as committed task claims, and ordinary failure callbacks on a marked task exhaust it instead of requeueing against its archived message. Includes the SQL migration (which preserves an absent or paused recovery cron job and copies the installed recovery interval), generated types, and upgrade guidance with a stamped-backlog inventory query.
