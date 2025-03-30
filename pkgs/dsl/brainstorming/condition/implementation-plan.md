# Implementation Plan for Conditional Skipping Logic

Below is a comprehensive plan, split into multiple stages, to introduce and refine the “skipping logic” (`runIf` / `runUnless`) in both the database schema and the Flow DSL. At the end, you will find an “Actionable Steps” section with quick TODO items.

---

## Stage 1: Add Condition Columns and "skipped" Status

### Current State

At present, our `steps` table does not store conditional logic at all. The concept of skipping a step is not directly represented, and we only have these step statuses in `step_states`:

- `created`
- `started`
- `completed`
- `failed`

Similarly, the `steps` table has no columns for conditions like `runIf` or `runUnless`.

### Changes in This Stage

**1.** We will add two columns to the `steps` table for storing condition data:

- `run_if_condition jsonb` (optional)
- `run_unless_condition jsonb` (optional)

**2.** We will add a new state `skipped` in `step_states.status`. This allows us to mark a step as definitively skipped (distinct from `completed` or `failed`).

**3.** We will allow `runIf` and `runUnless` to co-exist. If both are given, the engine must pass both conditions (i.e., `runIf(verbose) && !runUnless(verbose)`) for the step to run.

### End Result

After Stage 1:

- The database schema can store conditions in `steps.run_if_condition` and `steps.run_unless_condition`.
- We can mark steps as `skipped` in `step_states` when conditions do not match, making the skip “visible” at runtime.

### Code Snippets

#### 1. Add Condition Columns

Below is an example migration snippet to add new columns to the `steps` table:

```sql
-- Example: Add run_if_condition and run_unless_condition columns to steps
ALTER TABLE pgflow.steps
ADD COLUMN run_if_condition JSONB DEFAULT NULL;

ALTER TABLE pgflow.steps
ADD COLUMN run_unless_condition JSONB DEFAULT NULL;
```

> **Commentary**:
>
> - We choose `JSONB` to store advanced or structured conditions.
> - Defaulting to `NULL` means “no condition.”

#### 2. Introduce Skipped Status

We need to update checks in `step_states` so we can store `skipped`:

```sql
-- Example: Update step_states to allow 'skipped' as a valid status
ALTER TABLE pgflow.step_states
  DROP CONSTRAINT step_states_status_check,
  ADD CONSTRAINT step_states_status_check CHECK (
    status IN ('created', 'started', 'completed', 'failed', 'skipped')
  );
```

If your existing constraint is named differently, adjust accordingly.

### Alternatives That We Dismissed

- **Storing conditions in `step_states`:** This would bloat runtime data. Since conditions are definitions rather than run-specific, storing them in `steps` is more appropriate.
- **Using a single JSON column for both `runIf` and `runUnless`:** Doing so would complicate parsing logic. Separate columns are simpler to handle (they can coexist without confusion).

### Additional Bonus Ideas

- **Add a short text column for condition expressions**: If you eventually want to store a small “human-readable” string describing the condition, it’s quite cheap to add a text column that mirrors the JSON structure or a snippet of code.
- **Add an indexed expression on `run_if_condition`** if you plan to do partial lookups or advanced queries. This is easy to maintain if you rely on standard Postgres JSON indexing.

---

## Stage 2: Extend Flow DSL to Accept `runIf` and `runUnless`

### Current State

Right now, the Flow DSL does not parse or accept `runIf` / `runUnless` fields on `.step()` definitions. It only supports basic `dependsOn`, `maxAttempts`, etc.

### Changes in This Stage

**1.** Update your Flow DSL to allow:

```ts
flow.step(
  {
    slug: 'myStep',
    runIf: { run: { userIsVIP: true } },
    runUnless: { run: { userIsDisabled: true } },
  },
  handlerFunction
);
```

**2.** During flow compilation, store these objects in the newly created DB columns (`run_if_condition`, `run_unless_condition`) via your `add_step` routine.

### End Result

- The DSL can safely parse `runIf` and `runUnless` (both optional).
- If both exist, we don’t treat them as mutually exclusive; we simply store both in the database. They are combined (the step must satisfy the `runIf` condition and fail the `runUnless` condition to run).

### Code Snippets

Below is a conceptual snippet showing how you might adapt your `addStep` function in TypeScript to include condition data:

```ts
interface StepOptions {
  slug: string;
  dependsOn?: string[];
  runIf?: Record<string, any>; // or a more structured type
  runUnless?: Record<string, any>;
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
  // ...
}

export async function addStepToDB(flowSlug: string, opts: StepOptions) {
  const { slug, dependsOn, runIf, runUnless, maxAttempts, baseDelay, timeout } =
    opts;

  // Convert the runIf/runUnless objects to JSON if needed
  const runIfJSON = runIf ? JSON.stringify(runIf) : null;
  const runUnlessJSON = runUnless ? JSON.stringify(runUnless) : null;

  // Insert into DB. Sample with direct SQL or a query builder:
  await db.query(
    `
    SELECT pgflow.add_step(
      $1,   -- flow_slug
      $2,   -- step_slug
      $3,   -- deps_slugs
      $4,   -- max_attempts
      $5,   -- base_delay
      $6    -- timeout
    )
  `,
    [flowSlug, slug, dependsOn || [], maxAttempts, baseDelay, timeout]
  );

  // Now update the runIf and runUnless columns (or inline them in the add_step function)
  await db.query(
    `
    UPDATE pgflow.steps
      SET run_if_condition = $1::jsonb,
          run_unless_condition = $2::jsonb
    WHERE flow_slug = $3 AND step_slug = $4
  `,
    [runIfJSON, runUnlessJSON, flowSlug, slug]
  );
}
```

> **Commentary**:
>
> - You can either expand `pgflow.add_step` to include the condition columns or do a second `UPDATE` as shown. The “second update” method is a typical approach if you want to keep your existing `pgflow.add_step` signature minimal.

### Alternatives That We Dismissed

- **Force the user to define a single condition object**: We want to keep `runIf` and `runUnless` separate to clarify their usage and keep the logic straightforward.

### Additional Bonus Ideas

- **Validate the condition schema**: You could easily add a small function that checks the structure of the `runIf` / `runUnless` JSON and ensures no invalid patterns. This is a cheap addition that can prevent mistakes in flow definitions.
- **Generate TypeScript types from the condition**: If you want strong typed checks, you could use a custom type or a small library (like `zod`) to define the shape of your conditions.

---

## Stage 3: Implement the Skipping Logic in the Engine

### Current State

Our engine logic (e.g. `start_ready_steps`, `complete_task`, etc.) does not evaluate conditions. Steps automatically move from `created` to `started` if their dependencies are completed.

### Changes in This Stage

**1.** **Teaching the Engine to Evaluate Conditions**

- Before a step transitions from `created` → `started`, we:
  1.  Compute the step input (merging run input + outputs of dependencies).
  2.  Check `run_if_condition` (if present) → must be satisfied.
  3.  Check `run_unless_condition` (if present) → must _not_ be satisfied.
- If the final result is “does not pass,” mark the step as `skipped`.

**2.** **Skipping All Dependents**

- If we skip a step, we also skip all steps that depend on it, transitively. This can be done by:
  - Marking the step `skipped`.
  - Setting `remaining_tasks = 0` (so it’s not started).
  - Recursively marking all children that have this step as a dependency (or waiting until those children check their own conditions and find a missing dependency output).
- The simplest approach is an immediate cascade: once we skip a step, we locate all steps that depend on it, set their states to `skipped`, and continue recursively.

### End Result

- Steps are conditionally skipped if `runIf` / `runUnless` doesn’t match.
- Once a step is marked skipped, all of its downstream steps are also skipped.
- This pairs neatly with future subflows logic, so skipping an entry step to a subflow means the entire subflow is effectively skipped.

### Code Snippets

Below is a conceptual pseudo-SQL snippet you could add to `start_ready_steps` or a similar function:

```sql
-- Pseudo-logic in start_ready_steps or a new function check_conditions_for_step
-- Right when we pick "ready_steps" that have remaining_deps=0,
-- we do an additional check on run_if_condition and run_unless_condition.

WITH step_def AS (
  SELECT s.run_if_condition, s.run_unless_condition
  FROM pgflow.steps s
  WHERE s.flow_slug = step_state.flow_slug
    AND s.step_slug = step_state.step_slug
),
input_data AS (
  -- Build the step input the same way poll_for_tasks does
  SELECT ... merged_input ...
)
SELECT
  -- Evaluate condition
  CASE
    WHEN step_def.run_if_condition IS NOT NULL
         AND NOT pgflow.evaluate_json_condition(input_data.merged_input, step_def.run_if_condition)
      THEN true -- should skip?
    WHEN step_def.run_unless_condition IS NOT NULL
         AND pgflow.evaluate_json_condition(input_data.merged_input, step_def.run_unless_condition)
      THEN true -- should skip?
    ELSE false
  END as should_skip
FROM step_def, input_data;

-- If should_skip = true, mark the step as "skipped" (and cascade skip).
```

You would then do:

```sql
UPDATE pgflow.step_states
SET status = 'skipped',
    remaining_tasks = 0
WHERE run_id = <...> AND step_slug = <...>;
```

…and proceed to recursively skip or not schedule the dependents.

> **Commentary**:
>
> - The function `evaluate_json_condition` is an example utility or snippet to do partial matching. The simplest approach might be a containment check `input @> condition` for `runIf`, but real use cases may require more advanced logic.
> - For `runUnless`, invert that check.

### Alternatives That We Dismissed

- **Deferring skip decisions until the worker**: We want to skip in the DB itself to avoid scheduling tasks at all. Letting the worker do skip checks is feasible but complicates logic, because tasks would appear “started” even if we intend to skip them.

### Additional Bonus Ideas

- **Add a dedicated skip function**: e.g., `pgflow.skip_step(run_id, step_slug)`, which handles the cascade by walking the `deps` table. This can be re-used in other automation or for manually skipping certain parts of a flow.
- **Add a column to store "skip reason"** if you want to see _why_ a step was skipped. This can be as simple as a text column stating “Condition not met.”

---

## Stage 4: Evaluating Whether to Store Task Outputs in `step_states`

### Current State

Currently, **step outputs** live in `step_tasks.output` when a task completes. We do not store them in `step_states`, so if you want to see a step’s final output, you must query the tasks table (and typically look up the single “completed” task).

### Changes in This Stage

- If we decide to store outputs in `step_states.output`, we would add a new column, for example:
  ```sql
  ALTER TABLE pgflow.step_states
  ADD COLUMN output jsonb DEFAULT NULL;
  ```
- Upon `complete_task`, we would also update `step_states.output` with the same data.

### End Result

- **Pros**:
  - Easier to query the final output of a step; you can see it directly on `step_states` without additional joins.
  - Potentially simpler logic for building subflow or advanced branching.
- **Cons**:
  - Data duplication (the same JSON also lives in `step_tasks.output`).
  - Slightly more overhead on `complete_task` updates (we store output in two places).

### Code Snippet Example

Below is an example of how you might add it to the `complete_task` function:

```sql
-- In the relevant part of complete_task:
WITH ...
step_state AS (
  UPDATE pgflow.step_states
  SET
    status = CASE
      WHEN remaining_tasks = 1 THEN 'completed'
      ELSE status
    END,
    remaining_tasks = remaining_tasks - 1,
    output = complete_task.output  -- <--- new line to store output
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  RETURNING pgflow.step_states.*
)
...
```

### Alternatives That We Dismissed

- **Not storing outputs**: We already are storing them, but only in `step_tasks`. That might be enough if your usage is straightforward.

### Additional Bonus Ideas

- **Store partial outputs**: If you have steps that produce large or multiple results, you could store a summary or hash in `step_states.output` while the full result remains in `step_tasks.output`.
- **Prune or archive outputs**: If data grows large, you might add a policy to prune older outputs from `step_tasks` but keep a final summary in `step_states`.

---

## Actionable Steps

Below is the TODO-like checklist you can use for your Monday planning. Each item references the most relevant section above.

- TODO Update schema to include condition columns

  - ```sql
    -- example sql
    ALTER TABLE pgflow.steps
    ADD COLUMN run_if_condition JSONB DEFAULT NULL,
    ADD COLUMN run_unless_condition JSONB DEFAULT NULL;
    ```
  - see [link to relevant section](#stage-1-add-condition-columns-and-skipped-status)

- TODO Allow "skipped" in step_states.status

  - ```sql
    ALTER TABLE pgflow.step_states
    DROP CONSTRAINT step_states_status_check,
    ADD CONSTRAINT step_states_status_check CHECK (
      status IN ('created', 'started', 'completed', 'failed', 'skipped')
    );
    ```
  - see [link to relevant section](#stage-1-add-condition-columns-and-skipped-status)

- TODO Extend DSL to parse runIf / runUnless and store them in DB

  - see [link to relevant section](#stage-2-extend-flow-dsl-to-accept-runif-and-rununless)

- TODO Implement skip logic in start_ready_steps (or a new function)

  - see [link to relevant section](#stage-3-implement-the-skipping-logic-in-the-engine)

- TODO Implement cascade skipping approach to mark all dependents as skipped

  - see [link to relevant section](#stage-3-implement-the-skipping-logic-in-the-engine)

- TODO (Optional) Add output column to step_states to simplify final lookups
  - see [link to relevant section](#stage-4-evaluating-whether-to-store-task-outputs-in-step_states)

---

**With this plan in place**, you will be able to conditionally skip steps based on `runIf` / `runUnless` in a robust, extensible way, and optionally simplify step output retrieval by adding an `output` column to `step_states`. This ensures your conditional logic is easy to maintain, debug, and extend—particularly if you decide to leverage subflows or more advanced branching strategies in the future.
