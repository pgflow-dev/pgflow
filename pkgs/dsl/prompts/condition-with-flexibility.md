# Conditional Steps in a pgflow MVP: An Extensible Design for `runIf` / `runUnless`

This document comprehensively analyzes how to implement conditional skipping of steps (`runIf`/`runUnless`) in a **Minimum Viable Product (MVP)** phase of pgflow, while preparing for a future in which subflows (or branching) become first-class citizens. We also discuss how conditions might later be supplied as a callback—executed separately from the main step handler—so that task workers can decide to skip a step (or subflow) before committing resources.

## Table of Contents

1. [Introduction & Motivations](#introduction--motivations)
2. [High-Level Requirements](#high-level-requirements)
3. [RunIf / RunUnless Feature in the MVP](#runif--rununless-feature-in-the-mvp)
   1. [Step-Level Syntax](#step-level-syntax)
   2. [Database Model Updates](#database-model-updates)
   3. [Execution Logic](#execution-logic)
4. [Backward & Forward Compatibility](#backward--forward-compatibility)
5. [Extending to Subflows](#extending-to-subflows)
   1. [Approach: Flattened Branches vs. Standalone Subflows](#approach-flattened-branches-vs-standalone-subflows)
   2. [Referencing Conditional Steps in a Subflow](#referencing-conditional-steps-in-a-subflow)
6. [Callbacks for Condition Checking](#callbacks-for-condition-checking)
   1. [Design Options](#design-options)
   2. [Potential Worker APIs: skip_task or Condition-Only Tasks](#potential-worker-apis-skip_task-or-condition-only-tasks)
7. [Handling Versioning & Flow Slugs](#handling-versioning--flow-slugs)
8. [Proposed Step Condition Implementation Plan](#proposed-step-condition-implementation-plan)
9. [Conclusion](#conclusion)

---

## 1. Introduction & Motivations

Many workflows need basic conditional logic so that certain steps:

- **Only run** if specific data in the input or prior step output meets a condition (i.e., `runIf`).
- **Skip** if certain fields or flags indicate that it is not relevant (i.e., `runUnless`).

A minimal first iteration might rely on a small JSON-based condition. However, we want to ensure that as the system evolves:

- We can keep reusing this logic when we introduce subflows or more advanced branching.
- Conditions can eventually be provided as user-defined callback functions, enabling more complex or dynamic checks—e.g., preempting a step if the worker calculates the condition is not satisfied.

By **planning for extension**, we can avoid a breaking rewrite when subflows become a first-class feature.

---

## 2. High-Level Requirements

1. **MVP Feasibility**

   - Implement in a straightforward way that requires minimal schema updates and minimal engine changes.
   - Provide typical `runIf` or `runUnless` conditions on a step’s input object.

2. **Extensibility**

   - When full subflows or branching are introduced (e.g., `.subflow()` or `.branch()`), the same condition system can be reused.
   - Potential for user-defined callbacks that run in the worker, separate from the main step handler.

3. **Versioning-Compatible**

   - Align with the immutable flow definitions approach: a changed condition means a new flow slug.
   - No partial-upgrade pitfalls.

4. **Minimal Overhead**
   - For now, skip implementing extremely advanced logic (like multi-operator, multi-field conditions), but design it so that we can add them later.

---

## 3. RunIf / RunUnless Feature in the MVP

### 3.1 Step-Level Syntax

In the DSL, a typical usage might look like:

```ts
new Flow<{ userIsVIP: boolean }>({ slug: 'example_flow' })
  .step(
    {
      slug: 'vipStep',
      runIf: { run: { userIsVIP: true } },
    },
    async (input) => {
      // Only runs if userIsVIP === true
      /* ... */
    }
  )
  .step(
    {
      slug: 'regularStep',
      runUnless: { run: { userIsVIP: true } },
    },
    async (input) => {
      // Will be skipped if userIsVIP === true
      /* ... */
    }
  );
```

- **`runIf`** vs. **`runUnless`**: If `runIf` is present, the step only runs if the condition is _true_; if `runUnless` is present, it runs only if the condition is _not_ true.

**Potential (MVP) Implementation**:

- The condition is expressed as a simple JSON partial object that must be “contained” by the actual input object.
  - For example, `runIf: { run: { userIsVIP: true } }` would mean “skip unless `input.run.userIsVIP === true`.”

**Alternative**:

- A small typed function pointer in the DSL, which is compiled to JSON or stored as a string. However, we typically store conditions in JSON to remain flexible; the actual evaluation can happen either in Postgres or the Worker.

### 3.2 Database Model Updates

1. **New Column in `steps`**:

   - `condition jsonb` (optional).
   - Possibly an enum or text column to store if it’s a `runIf` or `runUnless`.

2. **Condition Storage**:
   - For an MVP, we might store something like:
     ```json
     {
       "type": "runIf",
       "match": {
         "run": { "userIsVIP": true }
       }
     }
     ```
   - Or simply store them as separate fields: `condition_type TEXT` (either `runIf` or `runUnless`), `condition JSONB` (the partial object or rule).

### 3.3 Execution Logic

We need a small piece of logic in the state machine so that **before** a step transitions from “ready” to “started,” we check:

1. If the step has a condition:
   - Evaluate the condition against the step’s combined input (merge of run input + outputs from dependencies).
   - If the condition fails:
     - Mark the step as **skipped**.
     - Decrement the run’s `remaining_steps`.
     - **Do not** enqueue a task for that step.
     - Any step that depends on it is also implicitly "skippable"? (One approach is “skip cascades,” or we let them try to run but see the skip field as required. For an MVP, we can say “A step is only triggered if all dependencies are `completed` or `skipped`.”)

**Skip Cascade**:

- If a step is skipped, it is effectively “completed with no output.” We’ll call it “skipped” state. This means that any step that depends on the skipped step can still run (unless that step requires data from it, which might be `undefined`).
- In a minimal approach, if a step absolutely needed output from a skipped step, it might crash or proceed with partial data. The system can eventually define “optional dependencies” or “optional: true.”
- For the MVP, we can keep it simple and allow steps to proceed even if a dependency is “skipped” (at which point, the input for that dependency is `null` or absent).

---

## 4. Backward & Forward Compatibility

1. **Backward**:
   - For existing flows, no condition means no skipping.
   - We do not break the schema if we add optional columns for `condition`.
2. **Forward**:
   - This logic can be extended to advanced condition syntax or user-defined callback checks.
   - The DSL can remain the same; we just expand how we parse or store the condition if needed.

---

## 5. Extending to Subflows

### 5.1 Approach: Flattened Branches vs. Standalone Subflows

As outlined in other documents, subflows can be:

- **Flattened** into the parent flow’s step list (the engine sees them as additional steps with slug prefixes).
- **Standalone** runs that the parent references.

Regardless of approach, a subflow or “branch” can also have a `runIf` or `runUnless` condition on its “entry step” or subflow “root.” The same condition logic used at the step level can apply to a subflow step or subflow container step.

### 5.2 Referencing Conditional Steps in a Subflow

In a future subflow scenario, you might do:

```ts
flow.subflow(
  {
    slug: 'payment_flow',
    runIf: { run: { paymentRequired: true } },
  },
  PaymentFlow
);
```

- The condition is checked before starting the subflow’s “root steps.”
- If `paymentRequired` is false, the subflow is entirely skipped.
- If we used flattened subflows, it’s effectively skipping those step definitions.
- If we used standalone subflows, we skip creating or scheduling the subflow run.

Hence, our **step-level** condition approach can seamlessly handle a “subflow root step” with the same logic.

---

## 6. Callbacks for Condition Checking

### 6.1 Design Options

Eventually, we want to allow more dynamic checks—for example:

```ts
new Flow().step(
  {
    slug: 'vipStep',
    runIf: {
      $type: 'functionCallback',
      code: `return input.run.userIsVIP === true && input.otherStep.prop > 100;`,
    },
  },
  async (input) => {
    /* ... */
  }
);
```

Or:

```ts
runIf: async function checkCondition(input) {
  return input.run.userIsVIP === true && input.websiteResponse.status === 200;
}
```

**How does that get stored or executed?**

- One approach: We store it as a text or code snippet, interpret it in the thread worker with a safe sandbox, or compile it.
- Another approach: We store a small reference in the DB, and the Worker calls a “condition-check” function that we attach to the DSL.

For the MVP, we can skip full dynamic code in the DB. We simply do partial matching in Postgres or in the Worker. The callback approach can come later, reusing the same “condition” column.

### 6.2 Potential Worker APIs: skip_task or Condition-Only Tasks

Imagine a scenario:

1. The Worker polls for a step.
2. The Worker first checks a separate user-defined “condition function.”
   - If it fails, the Worker calls `pgflow.skip_task(...)`.
   - If it passes, the Worker proceeds to do the real step handler and then calls `complete_task(...)`.

Alternatively, we could generate a “mini-task” specifically for condition checks, but that might be overkill. More likely, we do the check at the moment we decide to run the step.

**MVP**: We do the check in the database side before launching the step as “started.” In the future, if we want a user-provided callback, we might do it in the Worker code right after polling but before we mark the step “started.” If the condition fails, we call `skip_task(...)`.

---

## 7. Handling Versioning & Flow Slugs

- **Immutable flows**: If you change the step’s `runIf` or `runUnless` condition, that is effectively a new flow shape → new slug.
- This lines up with the existing approach of changing step definitions or dependencies.
- If at some point we allow a purely user-supplied JavaScript callback, changing the callback’s code still means a new flow slug for the new logic.

---

## 8. Proposed Step Condition Implementation Plan

Below is a concise plan for how to add `runIf` / `runUnless` in an MVP:

1. **Schema**:

   - Add two new columns to `steps`, e.g.:
     - `condition_type TEXT NULL` (enum: `'runIf' | 'runUnless'`)
     - `condition_json JSONB NULL`
   - No changes to `runs` or `step_states` except we might add a “skipped” status.

2. **DSL**:

   - Let users specify:
     ```ts
     .step({
       slug: 'myStep',
       runIf: { run: { userIsVIP: true } }
     }, handler)
     ```
     or
     ```ts
     .step({
       slug: 'myStep',
       runUnless: { run: { userIsVIP: true } }
     }, handler)
     ```
   - We store that condition in the DB as either `condition_type = 'runIf'` and `condition_json = {"run": {"userIsVIP": true}}`, etc.

3. **Engine Logic**:

   - After a step’s dependencies all succeed/skip, we do a quick check:
     - Build composite input (like we do for tasks).
     - Evaluate `condition_json` with a simple “containment match” if `runIf`, or `@>` logic in Postgres (some partial JSON check). If `runUnless`, invert the result.
     - If the match fails, mark the step as SKIPPED, do not queue the step.
     - If the match passes, queue a normal task.

4. **Skip Handling**:

   - Add “skipped” as a valid state.
   - A step that depends on a skipped step can still run once _all_ dependencies are in `completed` or `skipped` states (i.e., no “in progress” steps remain).

5. **Future Callback**:
   - Later, we may store a function reference or snippet in `condition_json`, and the Worker can attempt to run that code. If it returns `false`, Worker calls `skip_task(...)`.

---

## 9. Conclusion

Implementing a step-level condition (i.e., `runIf`, `runUnless`) is **very feasible** in an MVP. By storing a small JSON-based condition in the `steps` table and adding a “skipped” status, we allow steps to be conditionally short-circuited with minimal overhead.

- **Extend to Subflows**: The same logic can apply to a subflow’s root step or “subflow container step,” letting us skip entire subflows if a condition is not met.
- **Callbacks**: We can eventually let Worker code or user-defined scripts check conditions and explicitly skip tasks.
- **Versioning**: Changing conditions means a new flow slug, consistent with pgflow’s immutable approach.

This approach yields a straightforward, robust foundation to handle conditional logic in **pgflow** while laying the groundwork for advanced branching or dynamic subflows in the future.
