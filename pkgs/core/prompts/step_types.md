## Step types in MVP

Regular Steps

- Basic unit of work.
- Executes a handler that receives outputs from its declared dependencies.
- Its return value is passed to dependent steps.

## Planned step types

### Map Steps (tasks fanout)

- Designed for when a dependency returns an array.
- The handler runs once per array element (in parallel).
- The outputs are collected back into an array (order preserved) and passed downstream.

### Conditional Steps

- Each step will be able to specify a condition, regardless of its type
- Steps that run only when certain conditions are met
- A condition is provided (as a JSON fragment)
- At runtime, the inpuyt input for a step (from all deps) is matched via @> against the condition
- If the condition is not met, the step does not run and marked as skipped
- Dependent steps are not run and should probably be marked as skipped as well.

### Manual Approval Steps

- Steps that pause for human intervention.
- They just differ by NOT immediately queueing a task.
- Instead, they wait for an external update by calling **complete_step** to set their output and trigger downstream steps.

### Subflow Steps

- Encapsulate an entire subflow (a mini workflow) as a single step.
- A subflow is defined using the same DSL as the main flow.
- Each subflow has an automatic final step that gathers the outputs of all leaf steps.
- The subflow step triggers the subflow and waits until its output is ready.
- The aggregated output from the subflow becomes the output of the subflow step.

### Fanout subflows step

- Like Map steps, but instead of a task per array item, it runs a subflow per array item.
- It gathers final steps from subflows into an output array for the fanout subflow step

####

• “Fanout subflow” steps do not have local tasks. Instead, they spawn child subflows and wait for them to finish.
• You can track subflow completion with the same remaining_tasks field:
  – Increment remaining_tasks by the number of child subflows.
  – Decrement it each time a child subflow completes.
  – When remaining_tasks reaches zero, the fanout subflow step is done.
• Alternatively, you can add a remaining_subflows column to separate child‐subflow tracking from local tasks.
  – This gives clearer semantics but requires extra logic to handle multiple completion conditions.
• Most implementations unify subflow runs under remaining_tasks to reuse existing “remaining_tasks = 0 means done” checks.

### Additional Techniques

We simplify as much as possible and use other tools instead of reinventing the wheel.

- Recurrent tasks are handled externally via Cron triggers.
- Delays can be implemented using pgmq visibility timeouts.
- The overall design treats a flow as a single function with one input (parameters) and one output (final aggregated output).
