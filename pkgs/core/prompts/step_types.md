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
- They do not immediately queue a task.
- Instead, they wait for an external update by calling **complete_step** to set their output and trigger downstream steps.

### Subflow Steps

- Encapsulate an entire subflow (a mini workflow) as a single step.
- A subflow is defined using the same DSL as the main flow.
- Each subflow has an automatic final step that gathers the outputs of all leaf steps.
- The subflow step triggers the subflow and waits until its output is ready.
- The aggregated output from the subflow becomes the output of the subflow step.

### Final (Output) Steps

- Optional step to shape the overall output of the flow.
- It does not require explicit dependencies; it gathers all leaf step outputs.
- The handler processes these aggregated values to produce a final output.
- If not provided, the flow returns a default aggregation of leaf outputs.

### Fanout subflows step

- Like Map steps, but instead of a task per array item, it runs a subflow per array item.
- It gathers final steps from subflows into an output array for the fanout subflow step

### Additional Techniques

We simplify as much as possible and use other tools instead of reinventing the wheel.

- Recurrent tasks are handled externally via Cron triggers.
- Delays can be implemented using pgmq visibility timeouts.
- The overall design treats a flow as a single function with one input (parameters) and one output (final aggregated output).
