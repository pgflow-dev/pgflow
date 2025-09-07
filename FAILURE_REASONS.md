
## Failure Reasons

**Tasks**

* `failure_reason ∈ ('error','timeout')`.
* `error_message` free text.

**Steps**

* `failure_reason ∈ ('skipped','condition_error','preprocessing_error','task_error','task_timeout')`.

  * `condition_error`: `step_type='gen_cond'` threw or returned non-boolean.
  * `preprocessing_error`: `step_type='array'` threw, returned non-array, or empty array with `empty_array_mode='fail'`.
  * `task_error` / `task_timeout`: terminal aggregation from work tasks.
* `error_message` free text.
* No step-level “cancelled” reason (that’s domain-level payload).
