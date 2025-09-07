## Appending Fanout Tasks (on-demand items)

* Allowed **only when the step is `started`** (enforced); disallowed after completion.
* New tasks:

  * `task_index = max(existing) + 1`.
  * `origin = 'appended'` (seeded tasks use `origin='array'`).
  * **Route must match the step’s route** (`queue` or `direct`).
* Operational tip: for “replace one item,” **append first**, then complete the old item with your domain “cancelled” payload, so the step never drops to zero remaining.
