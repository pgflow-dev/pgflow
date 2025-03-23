# **Subflows in a Workflow DSL: Exploring Middle Ground Approaches**

**Table of Contents**

1. [Overview](#overview)
2. [Current Subflow Approaches](#current-subflow-approaches)
   - [Flattened Subflows](#flattened-subflows)
   - [Full-Blown Separate Runs](#full-blown-separate-runs)
3. [Challenges & Requirements](#challenges--requirements)
4. [Potential Strategies for a Middle Ground](#potential-strategies-for-a-middle-ground)
   1. [Introduce a "Subflow" Step Type in the DB](#1-introduce-a-subflow-step-type-in-the-db)
   2. [Lightweight "Meta-Run" Concept](#2-lightweight-meta-run-concept)
   3. [Hybrid Flattening with Metadata Markers](#3-hybrid-flattening-with-metadata-markers)
   4. [Namespace-Based Subflow + Additional Metadata](#4-namespace-based-subflow--additional-metadata)
5. [Handling Dependencies and Visibility](#handling-dependencies-and-visibility)
   - [Option 1: Automatic Dependency Expansion on Subflow Completion](#option-1-automatic-dependency-expansion-on-subflow-completion)
   - [Option 2: Subflow as a Single “Virtual Step” for the Parent](#option-2-subflow-as-a-single-virtual-step-for-the-parent)
6. [Setting Overrides Like `maxAttempts` for Subflows](#setting-overrides-like-maxattempts-for-subflows)
7. [Ideas, Hacks, and Shortcuts](#ideas-hacks-and-shortcuts)
8. [DX Considerations](#dx-considerations)
9. [Examples of "Subflow Step" Implementation Sketch](#examples-of-subflow-step-implementation-sketch)
   - [DB Schema Example](#db-schema-example)
   - [DSL Example](#dsl-example)
10. [Conclusion](#conclusion)

---

## **1. Overview**

When implementing subflows—flows within flows—to handle more complex or re-usable pieces of logic, you typically face two extremes:

1. **Flattened subflows** in which subflow steps are merged into the main flow with unique slug namespaces.
2. **Full-blown separate runs**, where each subflow is executed as an independent run with its own `parent_run_id`.

Each approach has pros and cons. This document explores how to find a middle ground that:

- Makes subflows distinguishable in the database and the UI.
- Avoids the overhead of managing entirely separate runs per subflow.
- Simplifies dependency management across subflows.
- Preserves the developer experience (DX) by keeping the DSL usage straightforward.

---

## **2. Current Subflow Approaches**

### **Flattened Subflows**

1. **How It Works**

   - When we invoke a subflow, we generate new steps within the parent flow.
   - The subflow’s step slugs are automatically namespace-prefixed to avoid collision.

2. **Key Advantages**

   - Queries remain simple because all steps are in a single run table.
   - Reuses the existing dependency engine (no new concept for subflows).
   - Minimal overhead in code and DB changes.

3. **Downsides**
   - DB does not recognize the concept of a subflow—just branches or steps.
   - Hard to set subflow-wide properties like `maxAttempts`.
   - If a parent step depends on the entire subflow finishing, we have to figure out all subflow "final" steps and add them as dependencies.

### **Full-Blown Separate Runs**

1. **How It Works**

   - A subflow spawns a new run in the DB with its own `flow_id`.
   - The child run references the parent run with a `parent_run_id`.

2. **Key Advantages**

   - Clear separation of flows in the database.
   - Easier to run arbitrary queries about subflows.
   - Potentially more flexible scaling, concurrency, etc.

3. **Downsides**
   - More complicated queries because you must handle both steps and subruns.
   - Extra overhead in creation and maintenance of runs.
   - Potentially more complex queue/worker logic to coordinate parent ↔ child statuses.

---

## **3. Challenges & Requirements**

1. **Visibility**

   - We want to see subflows in the UI or in the logs, so we know which steps belong to which subflow.

2. **Dependencies**

   - We often need a step in the parent flow to wait until a subflow is entirely done.
   - If the subflow has multiple “end steps” that produce different outputs, referencing them can get messy if we only flatten.

3. **Configuration**

   - We may need subflow-wide configurations (e.g., `maxAttempts`, `timeout`).

4. **Complexity**
   - We do not want to blow up complexity in the DB or in how we query the data.

---

## **4. Potential Strategies for a Middle Ground**

### **1. Introduce a "Subflow" Step Type in the DB**

- **Core Idea**  
  Extend your database schema to include a special step type: `step_type = 'subflow'`.

  - This step acts as a container for sub-steps.
  - You store some metadata (e.g., subflow slug, subflow config) directly in that row.
  - The sub-steps can still be flattened inside the same run, but they are all linked to the `subflow` step as their “parent” or “grouping.”

- **Pros**

  - Parent flow can reference the subflow step as a single entity.
  - Sub-step queries can be grouped by the parent subflow step ID.
  - Subflow-specific configurations can attach to that subflow step.

- **Cons**
  - Slight DB schema change (add `step_type`, `subflow_metadata` columns).
  - Some logic overhead to handle “subflow step” during scheduling.

### **2. Lightweight "Meta-Run" Concept**

- **Core Idea**  
  Each subflow is stored in the same table but flagged as “run scope subflow.” This doesn’t create a real separate run, but it does allow grouping or partial separation in the DB:

  1. The parent run has an ID, e.g. `run_id = 10`.
  2. Subflow steps store `parent_run_id = 10` but might have their own `sub_run_identifier` to group them.

- **Pros**

  - Database queries can group by `(run_id, sub_run_identifier)`.
  - We don’t artificially create new run rows.

- **Cons**
  - We still need a way to track which subflow each step belongs to.
  - We have to handle sub_run_identifier logic in code.

### **3. Hybrid Flattening with Metadata Markers**

- **Core Idea**  
  Keep subflows flattened but store small markers that indicate subflow boundaries. For example, each step record has a `flow_slug` field _and_ a `subflow_parent_slug` field if it belongs to a subflow.

- **Pros**

  - Queries remain simple because it’s still one run table.
  - Subflow boundaries reported in logs (`SELECT ... WHERE subflow_parent_slug = 'translation'`).
  - Can handle optional subflow-level overrides for `maxAttempts` or `timeout` if stored in the subflow’s “virtual root step.”

- **Cons**
  - Still not as clean as having a dedicated subflow type.
  - Must rely on naming or referencing the parent subflow step to group.

### **4. Namespace-Based Subflow + Additional Metadata**

- **Core Idea**  
  Similar to the flatten approach plus an explicit record for the subflow itself. Example:

  1. Subflow steps are named `translation.translate`, `translation.sentiment`, etc.
  2. The DSL logs a “subflow step” record with slug = `translation`.
  3. This record can store subflow-wide settings.

- **Pros**

  - Minimal changes from the flatten approach.
  - The “subflow step” is visible in the DB, so you can see high-level subflow data.
  - Automatic expansions of dependencies remain consistent with the flatten approach.

- **Cons**
  - You still have to implement reference logic to the “subflow step.”
  - Possibly repetitive prefixing of subflow step slugs.

---

## **5. Handling Dependencies and Visibility**

### **Option 1: Automatic Dependency Expansion on Subflow Completion**

- **Description**  
  Whenever you have a “dependsOn: ['mySubflow'],” the system automatically expands it into dependsOn every “final step” of `mySubflow`. “Final step” is any subflow step that has no further subflow steps depending on it.

- **Implementation Concerns**
  - Must track the subflow’s dependency graph within the parent.
  - Possibly done at compile-time (when building the Flow DSL).
  - The Database might only store the expanded version (`dependsOn = ['translation.answerTranslated', 'translation.summary']` etc.).

### **Option 2: Subflow as a Single “Virtual Step” for the Parent**

- **Description**  
  The parent flow sees the subflow as a single step that completes when all subflow steps complete. Internally, subflow steps are flattened in DB but logically grouped.

- **Implementation Concerns**
  - The subflow step is a superset aggregator of subflow status.
  - If any step in the subflow fails, the subflow aggregator fails.

---

## **6. Setting Overrides Like `maxAttempts` for Subflows**

If subflows are flattened:

1. **Approach**: The subflow's root step has a custom `maxAttempts`, and child steps can inherit it if not overridden.
2. **DB**: Use metadata columns at the “subflow step” that child steps consult.

If subflows are typed:

1. **Approach**: The row that indicates `step_type = 'subflow'` has a column `max_attempts_subflow`.
2. **DB**: The engine references `max_attempts_subflow` unless overridden in child steps.

---

## **7. Ideas, Hacks, and Shortcuts**

1. **Temporary Table for Subflow Steps**

   - During compile, generate subflow steps and stash them in a separate table, then expand them in the parent flow’s main table.

2. **UUID-based Suffix for Subflow Steps**

   - Instead of manually prefixing slugs, automatically add a subflow ID in the slug, e.g. `mySubflow_13e2e390.translate`.

3. **Portals**

   - Concept from React: subflow steps might be “ported” into the main flow, but a UI or log viewer can still show them under a subflow grouping.

4. **Override Bundles**
   - If a subflow is included multiple times, you could have a system that merges `maxAttempts`, `timeout`, etc. from the parent or subflow definitions.

---

## **8. DX Considerations**

1. **Readability**

   - Devs want a simple `.subflow(...)` call that’s intuitive.
   - Hide the complexity of slug prefixing or metadata marking from the user.

2. **Maintainability**

   - Minimal special-cases in code for subflows.
   - Clear error messages when a subflow step is missing a required output.

3. **Testing**

   - Subflows can be tested independently, or inline with the parent flow.

4. **Traceability**
   - Logs, dashboards, or console output should group subflow logs under the subflow’s label.

---

## **9. Examples of "Subflow Step" Implementation Sketch**

### **DB Schema Example**

```sql
-- A single table for steps

CREATE TABLE steps (
  id SERIAL PRIMARY KEY,
  run_id INT NOT NULL,
  slug TEXT NOT NULL,
  step_type TEXT NOT NULL DEFAULT 'normal',  -- e.g. 'normal', 'subflow', ...
  parent_step_id INT NULL,                   -- if step belongs to a subflow container
  subflow_slug TEXT NULL,                    -- e.g. 'translation'
  max_attempts INT NULL,
  timeout INT NULL,
  -- additional columns for logs, status, result, etc.
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

Example records:

| id  | run_id | slug                         | step_type | parent_step_id | subflow_slug | max_attempts | timeout | …   |
| --- | ------ | ---------------------------- | --------- | -------------- | ------------ | ------------ | ------- | --- |
| 1   | 42     | detectLanguage               | normal    | NULL           | NULL         | 3            | 5       | …   |
| 2   | 42     | translation (subflow root)   | subflow   | NULL           | translation  | 5            | 15      | …   |
| 3   | 42     | translation.translate        | normal    | 2              | translation  | 5            | 15      | …   |
| 4   | 42     | translation.answerTranslated | normal    | 2              | translation  | 2            | 10      | …   |

In this sketch:

- Row `2` represents the subflow’s “root” step.
- Rows `3` and `4` are child steps that have `parent_step_id = 2`.

### **DSL Example**

```ts
// Could be how you define a subflow step
flow.subflow(
  {
    slug: 'translation',
    maxAttempts: 5,
    timeout: 15,
  },
  (sub) =>
    sub
      .step({ slug: 'translate' }, async (input) => {
        /*...*/
      })
      .step({ slug: 'answerTranslated' }, async (input) => {
        /*...*/
      })
);
```

Under the hood, the DSL:

1. Inserts a “subflow step” with slug = "translation" into the steps array (or store).
2. Each `.step()` call under `sub` references the subflow step as `parent_step_id`.
3. The final parent flow sees “translation” as a single unit for dependency referencing, but the subflow steps are individually recorded with their own states.

---

## **10. Conclusion**

A sweet spot between fully flattening subflows and turning them into separate runs can achieve:

1. **Better DB Visibility** – We can see subflow groupings.
2. **Easier Dependency Management** – The parent can depend on the subflow root, avoiding manual expansion on “final steps.”
3. **Controlled Configuration** – Subflows can have shared settings (e.g., `maxAttempts`, `timeout`).
4. **Minimal Overhead** – We do not need the complexity of entirely separate runs.

Whether you choose a “subflow step type” or a “lightweight meta-run” approach, the key principles remain:

- **Store extra metadata** to differentiate subflows from normal steps.
- **Maintain a single run** unless you truly need separate concurrency or per-flow scheduling.
- **Offer a streamlined DSL** so developers can define subflows with minimal ceremony.

By iterating on these concepts—especially introducing a conceptual “subflow step” type in your DB—and adding a bit of unique suffixing or ID-based grouping, you can maintain the simplicity of the flattened approach while gaining the ability to see and manipulate subflows as first-class entities. This approach should keep your codebase flexible, your data model clean, and your developer experience top-notch.
