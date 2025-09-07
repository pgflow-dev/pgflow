## Skip Model

* **Where:** JSON (on gate taskless steps), TS (on step_type=bool steps), and empty arrays (on fanout with `empty_array_mode='skip'`). Tasks have **no** skip/cancel semantics.
* **`skip_mode` (per step/branch):**

  * `propagate` (default): skipped nodes don’t produce output; downstream behaves accordingly.
  * `optional`: downstream input type reflects optional dependency (DSL typing).
  * `fail`: mark the node **failed** with `failure_reason='skipped'`.
* If skipped under `fail`, `status='failed'` and the run/branch updates accordingly.
