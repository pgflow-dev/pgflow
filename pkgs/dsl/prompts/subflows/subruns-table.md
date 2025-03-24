# **Next Steps: Implementing Subflows (Subruns) with Parent References and Indexing**

This document outlines a plan for implementing subflows—referred to here as “subruns”—in a manner that supports branching, reusable workflow components, and clear database visibility. We will explore two distinct approaches for storing subruns, clarify parent–child relationships, and introduce an indexing strategy (`run_index` / `subrun_index`) for keeping the data well-structured and queryable.

---
## **1. Overview**

Subflows allow you to embed smaller flows within a larger “parent” flow, keeping logic modular and reusable. To make subflows first-class entities:

- **We treat each subflow instance as a “subrun,”** which references:
  1. A `parent_run_id` (the main workflow run).
  2. A `parent_step_slug` (the step in the parent workflow that triggers the subflow).
- **We store indexing details** (`run_index`, `subrun_index`, etc.) to easily query or filter subruns within the database or logs.

The key questions revolve around how to store subruns:

1. **Approach A**: Subruns live in the same `runs` table.  
2. **Approach B**: Subruns get their own dedicated `subruns` table.

Both approaches support referencing the parent’s run and step, but differ in how data is physically separated or combined.

---
## **2. Key Requirements**

1. **Parent–Child Links**  
   Each subrun must store:
   - `parent_run_id`: The primary key from the parent run.  
   - `parent_step_slug`: The step in the parent flow that spawns this subflow.

2. **Unique Identification**  
   We need a clear way to identify each subrun. This might involve:
   - Generating a unique `subrun_id` separate from the parent run.  
   - Combining `run_id` with a sub-run index (e.g., `run_id = 123` and `subrun_index = 1`).

3. **Indexing / Retrieval**  
   - We want to quickly query all subruns of a particular parent run, or filter by `parent_step_slug`.
   - The indexing strategy (`run_index`, `subrun_index`) should be consistent for easy debugging and UI representation.

4. **Branching and Type-Safe Mapping**  
   - The subflow DSL must let the parent flow pass input fields to the subflow and retrieve the output fields.  
   - Dependencies in the parent flow can depend on the subflow’s “final steps” or treat the subflow as a single virtual step.

5. **Compatibility with Skipping / runIf / runUnless** *(Optional but recommended)*  
   - If the parent step is skipped, the subflow is also effectively skipped.  
   - The engine logic can uniformly handle “runIf,” “runUnless,” or other conditional logic for subflows.

---
## **3. Two Approaches to Storing Subruns**

### **Approach A: Store Subruns in the `runs` Table**

**Core Idea**  
We continue to use the existing `runs` table for everything (both parent runs and child subruns). Each subrun row has columns:

- `id` (PK for the subrun)  
- `parent_run_id` (nullable—if `NULL`, it’s a top-level run)  
- `parent_step_slug` (nullable—if `NULL`, it’s a top-level run)  
- `flow_slug` (referencing which flow definition this run is for)  
- *Optional:* `run_index` if you want to separate the notion of subruns from runs

**Pros**  
1. Simpler to keep a single table: easy to reuse existing queries for “all runs.”  
2. We can make queries that unify top-level flows and subflows in one pass.  
3. No major rearchitecture beyond adding a few columns for `parent_run_id` and `parent_step_slug`.

**Cons**  
1. The `runs` table can become large and cluttered with both top-level and subflow entries.  
2. Might require a “subrun vs. run” type flag to differentiate them when listing.  
3. If you want to drastically different schema for subruns, you’ll have to embed specialized columns in the same table.

**Example Schema Changes**

```sql
ALTER TABLE pgflow.runs
ADD COLUMN parent_run_id INT NULL,
ADD COLUMN parent_step_slug TEXT NULL,
ADD COLUMN run_index INT NULL; -- e.g. "this is subrun #2 of run #100"
```

**Runtime Mechanics**  
- When the parent step triggers the subflow, the engine inserts a new row into `runs`.  
- `parent_run_id` references the parent run’s ID.  
- `parent_step_slug` identifies the step that spawned the subflow.  
- The engine schedules steps within this subrun as usual, but can track the child run’s status to determine when the subflow is “done.”

### **Approach B: Store Subruns in a Dedicated `subruns` Table**

**Core Idea**  
Create a new table, say `pgflow.subruns`, that specifically holds the subflow runs. Each record might have:

- `subrun_id` (PK in this dedicated table)  
- `parent_run_id` (FK to `runs.id`)  
- `parent_step_slug`  
- `subflow_slug` (which flow definition the subrun is for)  
- `subrun_index`

**Pros**  
1. Clear separation of top-level runs (`pgflow.runs`) from subruns (`pgflow.subruns`).  
2. Potentially simpler queries if you only want subruns or only want top-level runs.  
3. Allows you to store subflow-specific metadata without cluttering the main runs table.

**Cons**  
1. You need to join between `runs` and `subruns` to get a complete picture of all running flows.  
2. Additional code is required to manage subrun creation vs. run creation.  
3. Some queries or logs might be split across two tables, which can add complexity.

**Example Schema**

```sql
CREATE TABLE pgflow.subruns (
  subrun_id SERIAL PRIMARY KEY,
  parent_run_id INT NOT NULL REFERENCES pgflow.runs(id),
  parent_step_slug TEXT NOT NULL,
  subflow_slug TEXT NOT NULL,
  subrun_index INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

Where “step” or “log” data for the subrun can link back via `subrun_id` instead of `run_id`.

**Runtime Mechanics**  
- The parent flow step triggers creation of a `subruns` record.  
- Steps specifically for that subflow insert states/outputs referencing `subrun_id` instead of `run_id` (or referencing `run_id` plus `subrun_id`, depending on your design).  
- The subflow DSL completes, the subrun is marked “completed” or “failed.” The parent can then proceed.

---
## **4. Tracking `run_index` / `subrun_index`**

Regardless of the approach, having an index helps group or order subruns:

- **`run_index`**: an integer auto-increment within a single parent run to identify subflow invocations. For example, the first subrun triggered in a run might have `run_index = 1`, the second subrun `run_index = 2`, etc.
- **`subrun_index`**: in Approach B, if the subflow can itself contain nested subflows, you might keep an additional nested index. Example: subflow’s child subflows each have their own index.

This structure helps to:

1. Easily see “which subrun is which” if the same subflow is triggered multiple times within the same parent run.  
2. Show a user-friendly subflow numbering in logs and UI.

Here’s a possible approach:

1. **On subrun creation**, query the max `run_index` from existing subruns with the same `parent_run_id` and increment by 1.  
2. Store that in the `run_index` column of the subrun row.  

If you want nested subflows beyond one level, you could store a dotted path like “1.3.2” or a separate “parent_subrun_id,” but that’s a more advanced scenario.

---
## **5. Database Schema Adjustments**

### **If We Go with a Single `runs` Table (Approach A)**

1. **Add columns** to `pgflow.runs`:

   ```sql
   ALTER TABLE pgflow.runs
   ADD COLUMN parent_run_id INT NULL,
   ADD COLUMN parent_step_slug TEXT NULL,
   ADD COLUMN run_index INT NULL; 
   ```

2. **Add an index** if we want quick lookups:

   ```sql
   CREATE INDEX idx_runs_parent
   ON pgflow.runs (parent_run_id, parent_step_slug);
   ```

3. **Optional**: add a `run_type` column with `'top-level'` or `'subrun'` to easily differentiate.

### **If We Use a `subruns` Table (Approach B)**

1. **Create new table**:

   ```sql
   CREATE TABLE pgflow.subruns (
     subrun_id SERIAL PRIMARY KEY,
     parent_run_id INT NOT NULL REFERENCES pgflow.runs(id),
     parent_step_slug TEXT NOT NULL,
     subflow_slug TEXT NOT NULL,
     subrun_index INT NOT NULL,
     status TEXT NOT NULL DEFAULT 'created',
     created_at TIMESTAMP DEFAULT now(),
     updated_at TIMESTAMP DEFAULT now()
   );
   ```

2. **Changing Step Storage**:  
   - Steps for a subrun either go into `pgflow.steps` referencing “`subrun_id`” or, if you keep them in the same table as the parent, they must store a new field like `subrun_id` or “`(run_id, subrun_id)`.”  

3. **Parent–Child Consistency**  
   - If the parent run is canceled or fails, do we also cascade that to subruns? You might create triggers or handle it in your application logic.

---
## **6. DSL & Engine Changes**

1. **DSL**  
   - Add `.subflow({ slug: 'mySubflow', flow: PaymentFlow, … })` syntax.  
   - Under the hood, the system decides how to store subflow invocation:
     - **Approach A**: Insert a new row in the `runs` table with `parent_run_id` referencing the parent.  
     - **Approach B**: Insert a row in `subruns`, referencing the parent run in `parent_run_id`.

2. **Referencing Inputs & Outputs**  
   - The parent flow maps certain outputs to the subflow’s inputs (type-safe).  
   - The subflow’s final steps produce outputs, which are attached to the subrun.  
   - Parent steps can depend on “subflow completed.” The DSL can treat subflow as a single step or expand dependencies in detail.

3. **Engine Execution**  
   - When the parent step triggers the subflow, the engine marks the parent step as “completed” or “in progress” and spins up the subrun.  
   - The subrun runs its steps, referencing `parent_run_id` and `parent_step_slug` (or `subrun_id`).  
   - On subrun completion, the parent flow sees subflow output and can proceed.

4. **Conditional Skipping** *(integrated with subruns)*  
   - If your DSL or engine supports `runIf` / `runUnless`, a skipped subflow “root step” immediately marks the entire subrun as `skipped`.  
   - For partial skipping inside a subflow, the same logic applies to subrun steps.

---
## **7. Actionable Steps**

Below is a consolidated checklist to guide implementation.

1. **Decide on Storage Approach (A or B)**
   - If you prefer a simpler single-table approach, add `parent_run_id`, `parent_step_slug`, `run_index` to `runs`.  
   - If you want stronger separation, implement a new `subruns` table.

2. **Add Index/Reference Columns**
   - Set up `run_index` or `subrun_index` for subflow identification.  
   - For Approach A, you might do something like:

     ```sql
     ALTER TABLE pgflow.runs
     ADD COLUMN parent_run_id INT NULL,
     ADD COLUMN parent_step_slug TEXT NULL,
     ADD COLUMN run_index INT NULL;
     ```

3. **Extend the DSL to Create Subruns**
   - On `.subflow()`, create a new row in `runs` or `subruns`.  
   - Store the parent references: `parent_run_id`, `parent_step_slug`, and computed `run_index`.  

4. **Implement Subflow Execution Logic in the Engine**
   - Engine receives a new subrun record → sets up tasks for the subflow’s steps.  
   - On completion, store subflow outputs in a determined location (could be `runs.output` or a dedicated subrun output table).

5. **Ensure Parent–Child Status Aggregation**
   - If subflow finishes successfully, the parent step referencing it moves to “completed.”  
   - If subflow fails or is canceled, the parent step might fail or skip.  
   - Optional: cascade parent run cancellation → subruns canceled.

6. **(Optional) Integrate Conditionals/Skipping**
   - If skipping logic is relevant, ensure subflow “root steps” can be marked skipped.  
   - Entire subrun = skipped if the conditions or parent step are skipped.

7. **UI / Logging Updates**
   - In logs or a UI console, display subruns under the parent run + parent step.  
   - If using `run_index`, label them systematically, e.g. “Subrun #2 for parent step ‘process_payment.’”

8. **Testing & Validation**
   - Test subflow creation, ensuring parent–child references are correct.  
   - Test concurrency or partial failures.  
   - Verify that outputs from subruns can be correctly accessed and used by downstream parent steps.

---

## **Conclusion**

By implementing subruns with a clear link to the parent run and parent step, you enable:

1. **Reusable “Functional” Subflows**  
   Each subflow can have well-defined inputs/outputs, making your main flows simpler.

2. **Robust DB Visibility**  
   Whether you store subruns in the main `runs` table or a dedicated `subruns` table, you gain the ability to debug and query subflows natively.

3. **Configurable Branching & Indexing**  
   Using `run_index` / `subrun_index` helps track multiple subflows triggered by the same parent flow or step.

4. **Extensibility**  
   The same approach can be extended for nested subflows or advanced features like skipping logic, partial concurrency limits, or subflow-specific resource constraints.

By following the steps above—especially deciding on a storage approach and implementing consistent parent–child references plus indexing—you can maintain a clean, scalable workflow engine that offers both power and clarity for subflow operations.
