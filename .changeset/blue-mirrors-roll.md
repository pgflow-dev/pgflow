---
'@pgflow/core': patch
---

Fix `poll_for_tasks` latency

The previous implementation were calling `read_with_poll` in same statement
as the `SELECT FROM step_tasks`, which resulted in new tasks that were inserted
after the `read_with_poll` started were not discovered as those were not visible
in the statement.

Now `poll_for_tasks` is split to separate statements so step tasks created
during the `poll_for_tasks` will be immediately picked up.
