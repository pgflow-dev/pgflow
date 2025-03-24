# Subflows in pgflow: Comparing Two Approaches

This document compares two different ways of implementing *subflows* (or *branching*) within **pgflow**. Specifically, we look at:

1. **Standalone Subflows**  
   - As described in `subflows.md`, subflows are stored as separate flows in the database.  
   - They are referenced by special DSL methods and require separate input/output mapping.  
   - The database would need a particular column (e.g., `parent_run_id` + `step_slug`) in `pgflow.runs` to track a subflow’s parent.

2. **Flattened Branches (`.branch()` or `.subflow()`)**  
   - Steps are “immediately appended” to the main flow but grouped logically as a “branch.”  
   - Step slugs in the branch receive an automatic prefix to avoid name collisions.  
   - Subflows are effectively “flattened” into the parent, but the DSL can preserve isolation through prefixing.  
   - An alternate design might allow passing an entire `Flow` object into `.subflow()`, flattening and prefixing each step under a single slug.

Below, we analyze these two approaches based on readability, maintainability, ease of implementation, schema changes, and performance.

---

## 1. Standalone Subflows

### Description
- Each subflow is defined as its own flow in the DSL and written to the database as an independent entity.
- A parent flow that wants to invoke a subflow references it by some special method, passing input and receiving output. 
- Internally, the database must store extra *relationship fields*, such as `parent_run_id` or `parent_step_slug`.

### Key Points
- Subflow runs have their own records in the `runs` table (with a field linking them back to the parent run/step).  
- Each subflow can be reused by referencing it from multiple parent flows without redefinition.  
- Input/output mapping between parent flow and subflow is explicit and can be edited independently.

---

## 2. Flattened Branches (`.branch()` or `.subflow()`)

### Description
- A separate “branch” object is created in the DSL, but in reality, the steps are appended (flattened) to the main flow at definition time.
- Steps inside the branch are prefixed with the branch slug to avoid name collisions (e.g., `branch1.some_step`).
- The “branch” functionality is a DSL abstraction. It allows a more contained experience in code (like a local subflow), but physically they remain within a single flow run and single DAG in the database.
- The `.branch()` method could accept a callback defining the sub-steps, or it could accept a `Flow` object and flatten it in place.

### Key Points
- Maintains a single run record in the database: no new `runs` record for each subflow, because everything is part of the parent run.  
- No need for extra columns for parent-child run relationships; the logical subflow is merely a DSL concept.
- Each step is stored under a prefixed slug (e.g., `branch_slug.step_slug`) to isolate dependencies and outputs within the parent flow.

---

## Comparison

### 1. Readability

**Standalone Subflows**  
- Potentially clearer when you want a truly modular flow.  
- A subflow can be understood in isolation, with its own steps, dependencies, and run data.  
- References to subflows might look more verbose if you have multiple subflows in a single parent flow.

**Flattened Branches**  
- The DSL usage can be very direct; you add a `.branch()` call inline, which shows the sub-steps right there in the code.  
- The flow remains conceptually “unified” from top to bottom, although the prefixed step slugs might be less direct if you are reading the flattened representation in the database.  
- Possibly simpler to grasp as a quick branching or subflow without large structural changes.

**Verdict**:  
- If you value the ability to treat subflows as self-contained “mini-flows,” free of the parent’s step definitions, the standalone approach is more explicit.  
- If you prefer everything in one place, flattened branches offer a straightforward inline style.

### 2. Maintainability

**Standalone Subflows**  
- Fits well if you plan to reuse subflows in multiple places. You maintain the subflow in a separate, self-contained file or DSL definition.  
- Changes to the subflow do not directly break the parent flow’s definitions (as long as the input/output interface remains compatible).  
- Potential overhead in updating any references in the parent flows if you change the I/O signature of the subflow.

**Flattened Branches**  
- Changing or removing a branch typically just changes the portion of the code that defines that segment of the flow.  
- The steps get stored as if they were part of the main flow, so you do not have an extra subflow entity to manage or version.  
- Not as easily reusable if you want the same subflow logic in multiple parent flows (though you could replicate the `.branch()` code or attempt a DSL function).

**Verdict**:  
- Standalone subflows can be more reusable and can reduce duplication in large codebases.  
- Flattened branches are easier to keep contained within a single flow’s definition, however, and maintain a simpler mental model if you rarely need to share subflows.

### 3. Ease of Implementation

**Standalone Subflows**  
- Requires additional concepts at the database layer: a subflow run must carry references to its parent run/step.  
- You need new logic in the engine to start, link, and complete these subflow runs.  
- The DSL and engine must handle mapping inputs/outputs across flow boundaries.

**Flattened Branches**  
- Simpler from a runtime perspective, since everything is just one flow run.  
- The DSL logic that “flattens” the subflow steps is not overly complex; it mostly handles prefixing slugs and hooking up dependencies.  
- No new database columns or specialized logic for multiple runs.

**Verdict**:  
- Flattened branches require fewer structural changes and might be quicker to implement.  
- True subflow runs demand a more robust solution at both the DSL and SQL layer.

### 4. Impact on SQL Schema / Migration Cost

**Standalone Subflows**  
- Necessitates additional database columns or relationships. For instance, the `runs` table needs to store `parent_run_id`, `parent_step_slug`, or something similar to link subflow runs to their parent.  
- Removing or changing this schema later may be more involved if it’s deeply integrated into how runs are tracked.

**Flattened Branches**  
- No major schema changes are required—still the same approach of storing steps, runs, step states, etc.  
- You only introduce new step slugs that happen to include a “branch prefix” for uniqueness.  
- Easier to remove or refactor because it doesn’t alter the overarching structure of the data model.

**Verdict**:  
- Standalone subflows require more schema modifications, making them more complex to revert or adjust.  
- Flattened branches have minimal, if any, schema changes.

### 5. Performance Impact

**Standalone Subflows**  
- Potentially more overhead spinning up multiple runs, especially if subflows are large or run in parallel.  
- Each subflow has its own overhead (e.g., run record, root step tasks, etc.). However, for large workflows, this might help isolate concurrency or error handling at the subflow boundary.

**Flattened Branches**  
- The entire workflow, including “branch” steps, exists in a single run, so there is no extra overhead from creating new runs.  
- You treat all steps as part of one DAG, so concurrency and step scheduling is handled in one place. This can be more efficient if the flows share certain resources or data.  
- For extremely large flows, flattening might produce an enormous DAG, which could be less clear or hamper debugging if you tend to think in separate modules.

**Verdict**:  
- Flattened branches are simpler to schedule in a single run, with presumably lower overhead for short or mid-sized flows.  
- If your subflows are big, standalone subflows might be beneficial from a concurrency and debugging standpoint, but they also mean more “runs” exist in the database.

---

## Conclusion

Both approaches solve the problem of reusing and modularizing flow logic. The right choice depends on how you plan to structure and reuse workflows:

- **Standalone Subflows** are powerful if you need fully independent runs or if reusability and clear boundaries between subflows are critical. On the other hand, they complicate the SQL schema and add overhead in linking parent and child runs.  
- **Flattened Branches** (or `.subflow()`) allow you to keep everything in one run and maintain a simpler database structure. This is typically easier to implement and manage, especially if you don’t need separate subflow runs or advanced usage patterns. However, it offers less natural reuse if you need to embed the same subflow logic in multiple parent flows without duplication.

In practice, **flattened branches** often suffice for many workflow needs. If your application demands heavy reuse of subflows across many flows, or if you need logically distinct runs for separate modules, **standalone subflows** might be the more scalable approach.
