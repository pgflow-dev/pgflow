# Next Steps: Implementing Conditional Skips and Subflow Logic

Below is an updated, comprehensive plan that merges two key initiatives:

1. **Conditional Step Execution**: Introducing `runIf` / `runUnless` and a `skipped` status.  
2. **Subflows / Branching**: Implementing subflows without a separate “subruns” table, referencing the parent run and parent step, and introducing a `run_index` (or `subrun_index`) for clarity.

This document walks through the new database schema changes, DSL enhancements, engine logic, and the final actionable steps you can follow.

---

## Table of Contents

1. [Stage 1: DB Schema Enhancements](#stage-1-db-schema-enhancements)  
   1.1. [Condition Columns for `runIf` / `runUnless`](#1-condition-columns-for-runif--rununless)  
   1.2. [New `skipped` Status](#2-new-skipped-status)  
   1.3. [Subflow Columns: `parent_run_id`, `parent_step_slug`, `run_index`](#3-subflow-columns-parent_run_id-parent_step_slug-run_index)

2. [Stage 2: Extend the DSL](#stage-2-extend-the-dsl)  
   2.1. [Defining `runIf` / `runUnless` in `.step()`](#21-defining-runif--rununless-in-step)  
   2.2. [Defining Subflows via `.subflow()`](#22-defining-subflows-via-subflow)

3. [Stage 3: Implementing the Engine Logic](#stage-3-implementing-the-engine-logic)  
   3.1. [Evaluating Conditions and Skipping Steps](#31-evaluating-conditions-and-skipping-steps)  
   3.2. [Attaching Subflow Execution to Parent Steps](#32-attaching-subflow-execution-to-parent-steps)

4. [Stage 4: Storing Outputs in `step_states` (Optional)](#stage-4-storing-outputs-in-step_states-optional)

5. [Actionable Steps (Checklist)](#actionable-steps-checklist)

---

## Stage 1: DB Schema Enhancements

### 1) Condition Columns for `runIf` / `runUnless`

**Current State**  
We do not store any explicit conditional logic columns. The skipping concept is absent from the DB schema.

**Change**  
Add two new columns to the `steps` table (or your equivalent) to store JSON-based conditions:

```sql
ALTER TABLE pgflow.steps
ADD COLUMN run_if_condition JSONB DEFAULT NULL;

ALTER TABLE pgflow.steps
ADD COLUMN run_unless_condition JSONB DEFAULT NULL;
```

- `run_if_condition`: If present, the engine will only run the step if the condition is satisfied.  
- `run_unless_condition`: If present, the engine will only run the step if this condition is *not* satisfied.

**Why JSONB?**  
Conditions can be complex. Storing them in JSONB offers flexibility. A single step might rely on multiple inputs, or you may want to nest logic in your condition structure.

---

### 2) New `skipped` Status

**Current State**  
Our `step_states.status` typically contains:  
- `created`  
- `started`  
- `completed`  
- `failed`  

**Change**  
Add a new status `skipped`, then update constraints accordingly:

```sql
ALTER TABLE pgflow.step_states
  DROP CONSTRAINT step_states_status_check,
  ADD CONSTRAINT step_states_status_check CHECK (
    status IN ('created', 'started', 'completed', 'failed', 'skipped')
  );
```

This status is used when a step’s conditions are not met. As soon as we decide a step (and any of its transitive dependents) cannot run, we mark it as `skipped`.

---

### 3) Subflow Columns: `parent_run_id`, `parent_step_slug`, `run_index`

**Current State**  
We sometimes flatten subflows into the main `steps` table. Alternatively, we could create a separate `subruns` table. We want to avoid that extra overhead.

**Change**  
**We do NOT create a separate `subruns` table.** Instead, we enhance `steps` to reference the parent run and step, plus track a `run_index` (or `subrun_index`):

```sql
ALTER TABLE pgflow.steps
ADD COLUMN parent_run_id INT NULL,
ADD COLUMN parent_step_slug TEXT NULL,
ADD COLUMN run_index INT NULL; -- or "subrun_index"
```

- **`parent_run_id`**: Points back to the run that spawned this subflow. If it’s a top-level flow, this can be `NULL`.  
- **`parent_step_slug`**: Identifies which parent step triggered the subflow.  
- **`run_index` or `subrun_index`**: A numeric counter or sequence to differentiate multiple subflows invoked by the same parent step.

**Usage**  
- When a parent flow step spawns a subflow, we create new step records for that subflow, all tied to the same top-level `run_id` as the parent (if desired) or a new run row but referencing `parent_run_id` in either case.  
- Subflow steps can be grouped by `(run_id, parent_step_slug, run_index)` or `(parent_run_id, ...)` in queries.  
- The subflow steps remain in the same table for easy flattening in logs/UI but still retain “who spawned me?” metadata.

---

## Stage 2: Extend the DSL

### 2.1 Defining `runIf` / `runUnless` in `.step()`

**Current State**  
The DSL for `.step()` usually accepts something like:

```ts
flow.step(
  {
    slug: 'myStep',
    dependsOn: ['someOtherStep'],
    // ...
  },
  async (inputs) => { /* step logic */ }
);
```

**Change**  
Allow users to provide `runIf` / `runUnless`:

```ts
flow.step(
  {
    slug: "myStep",
    dependsOn: ["someOtherStep"],
    runIf: { run: { shouldSendEmail: true } },
    runUnless: { run: { userIsDeactivated: true } },
  },
  async (input) => {
    // ...
  }
);
```

**Implementation Details**  
When the flow is compiled (or “registered”), store these condition objects in the new `run_if_condition` / `run_unless_condition` columns. They will be evaluated by the engine later (see [Stage 3](#stage-3-implementing-the-engine-logic)).

---

### 2.2 Defining Subflows via `.subflow()`

**Current State**  
We either flatten subflows or run them as fully separate flows. We want to unify them with minimal overhead.

**Change**  
Introduce or refine a `.subflow()` DSL method that looks roughly like:

```ts
flow.subflow({
  slug: 'mySubflowStep',
  dependsOn: ['previousStep'],
  runIndex: 1, // optional or auto-generated
  flow: PaymentFlow, // an existing Flow object
  input: (parentOutputs) => ({
    // map parent outputs to subflow inputs
  }),
  output: (subflowOutputs) => ({
    // transform the subflow's final outputs for the parent
  }),
});
```

**Storing in the DB**  
- When `.subflow()` is used, we create entries in `steps` for each subflow step.  
- We also set:
  - `parent_run_id = <the run_id of the parent>`  
  - `parent_step_slug = 'mySubflowStep'` (or the subflow’s "root" slug)  
  - `run_index = runIndex || (some auto counter)`

**Outcome**  
A single “parent step” record appears in the main flow’s step list, plus multiple child steps that reference this “parent step.” They remain in the same `steps` table, but we can query them by `parent_step_slug`.

---

## Stage 3: Implementing the Engine Logic

### 3.1 Evaluating Conditions and Skipping Steps

When a step transitions from `created` → `started`, the engine must:

1. **Gather Inputs**: Merge all relevant run data, dependency outputs, etc.  
2. **Evaluate `runIf`**: If present, must be satisfied for the step to run.  
3. **Evaluate `runUnless`**: If present, must *not* be satisfied for the step to run.  
4. **Decide**:
   - If both checks pass, mark the step as `started` (and enqueue tasks).  
   - If they fail, mark the step as `skipped` and do a recursive skip of its dependents.

**Pseudo-SQL** (conceptual):

```sql
WITH step_def AS (
  SELECT s.run_if_condition, s.run_unless_condition
  FROM pgflow.steps s
  WHERE s.run_id = ...
    AND s.step_slug = ...
),
input_data AS (
  SELECT ... merged_input ...
)
SELECT CASE
   WHEN step_def.run_if_condition IS NOT NULL 
        AND NOT evaluate_json_condition(input_data, step_def.run_if_condition)
     THEN true -- skip
   WHEN step_def.run_unless_condition IS NOT NULL
        AND evaluate_json_condition(input_data, step_def.run_unless_condition)
     THEN true -- skip
   ELSE false
END as should_skip;
```

If `should_skip = true`, we set `step_states.status = 'skipped'` and skip all dependent steps.

---

### 3.2 Attaching Subflow Execution to Parent Steps

When a parent flow step triggers a subflow:

1. **Subflow Steps**: Created in the DB, referencing `parent_run_id`, `parent_step_slug`, and `run_index`.  
2. **Dependency**: The subflow’s “root” step typically depends on the “parent step.” The engine must ensure the parent step is `completed` (or not skipped) before scheduling the subflow steps.  
3. **Execution**: Each subflow step runs or is skipped the same way any normal step does—no separate table needed.  
4. **Completion**:
   - Once the subflow’s “final step(s)” complete, the DSL merges outputs back into the parent flow’s step named `mySubflowStep`.  
   - The parent flow can then continue to a next step that depends on `mySubflowStep`.

**Cascading Skips**  
If the subflow’s parent step is skipped, all subflow steps mark themselves as skipped automatically (`parent_step_slug` can be used to find them).

---

## Stage 4: Storing Outputs in `step_states` (Optional)

Currently we store step outputs in `step_tasks.output`. If you want quick access to each step’s final results (without querying tasks):

```sql
ALTER TABLE pgflow.step_states
ADD COLUMN output JSONB DEFAULT NULL;
```

- **On Task Completion**: Copy the final result into `step_states.output`.  
- **Trade-Off**: This duplicates data but simplifies queries and usage of subflow outputs.

---

## Actionable Steps (Checklist)

Below is a summarized TODO list:

1. **Add Condition Columns**  
   - `[Stage 1.1]`  
   ```sql
   ALTER TABLE pgflow.steps
   ADD COLUMN run_if_condition JSONB DEFAULT NULL,
   ADD COLUMN run_unless_condition JSONB DEFAULT NULL;
   ```

2. **Allow "skipped" in `step_states`**  
   - `[Stage 1.2]`  
   ```sql
   ALTER TABLE pgflow.step_states
   DROP CONSTRAINT step_states_status_check,
   ADD CONSTRAINT step_states_status_check CHECK (
     status IN ('created', 'started', 'completed', 'failed', 'skipped')
   );
   ```

3. **Add Subflow Columns**  
   - `[Stage 1.3]`  
   ```sql
   ALTER TABLE pgflow.steps
   ADD COLUMN parent_run_id INT NULL,
   ADD COLUMN parent_step_slug TEXT NULL,
   ADD COLUMN run_index INT NULL;
   ```

4. **Enhance DSL for `runIf` / `runUnless`**  
   - `[Stage 2.1]`  
   - Let `.step()` accept `runIf` and `runUnless`.  
   - During compilation, store them in the new columns.

5. **Add `.subflow()` DSL Method**  
   - `[Stage 2.2]`  
   - Generate subflow steps (still in the same `steps` table) referencing `parent_run_id`, `parent_step_slug`, and `run_index`.

6. **Implement Engine Check**  
   - `[Stage 3.1]`  
   - Before moving a step to `started`, evaluate `runIf` / `runUnless`.  
   - Mark step (and transitive dependents) as `skipped` if conditions fail.

7. **Cascade Skips for Subflows**  
   - `[Stage 3.2]`  
   - If the parent step is skipped, ensure all child subflow steps become `skipped`.

8. **(Optional) Store Outputs in `step_states`**  
   - `[Stage 4]`  
   - Add `output` column in `step_states`.  
   - Update it when tasks complete.

By following these steps, you will have:

- **Robust Conditional Execution** showing clearly in both the DSL and DB.  
- **Subflows without a separate `subruns` table**, preserving a simple, flattened approach while still tracking parent-child relationships.  
- **Full or partial** type-safe references to subflow inputs/outputs in the parent.  
- **Simplified Queries** for final outputs (if you add the optional `step_states.output` column).

This integrated plan keeps the codebase more maintainable, offers better debugging, and aligns smoothly with advanced use cases (like branching, reusable subflows, or deeper concurrency management) in a single, unified workflow engine.
