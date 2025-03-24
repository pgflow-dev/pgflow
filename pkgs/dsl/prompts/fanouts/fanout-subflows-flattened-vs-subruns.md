# Exploring "Fanout Subflows" in a Workflow System

This document explores the notion of “fanout” in a workflow DSL—where an array of items at runtime spawns multiple parallel subflows (or steps), merging their outputs when each is complete. We will examine:

1. **Practical Utility**: Is fanout really needed or overkill?  
2. **Flattened vs. Sub-Run Implementation**: Can we feasibly do it if we flatten all steps, or do we need genuine sub-runs?  
3. **Generic Implementations**: Is there a “basic” mechanism that could unify both fanout tasks and fanout subflows?  
4. **Implications of Using Sub-Runs**: If we pick sub-runs, how does that affect the entire subflow abstraction, and can the `.subflow()` idea still work? What about returning a `SubflowObject` in place of a callback?

Throughout, keep in mind that the array length for the fanout is **unknown at compile time** and only becomes clear once the flow is actually running.

---

## 1. Is a Fanout Feature Really Useful?

**Fanout** means taking an array (of N items) and producing N parallel tasks or subflows. Each parallel execution handles one array element, and when all parallel executions finish, their results merge back into a single array.

1. **Massively Parallel Processing**  
   - Whenever you have a list of items—say user IDs, URLs to scrape, or documents to process—fanout is an efficient way to parallelize.
   - This pattern is quite common: ingest multiple items, run the same logic on each item, then aggregate the outputs.

2. **Order-Sensitive Merging**  
   - A typical requirement is that the final aggregated array lines up with the original input order.
   - This is a non-trivial detail: if you run items in parallel, you must ensure results remain aligned with the input indices.

3. **Use Cases**  
   - Data pipelines (e.g., transform a batch of logs).  
   - Multi-tenant or multi-customer flows.  
   - Bulk computations (like AI inference or image processing) that must eventually return combined results.

4. **Conclusion**  
   - Fanout is extremely common in workflow systems, so having built-in support is more than a nicety; it’s borderline essential for serious batch parallelism.  

**Hence, yes, it’s quite useful and definitely worth adding**—provided the implementation overhead isn’t overwhelming.

---

## 2. Feasibility of Implementing Fanout in a Flattened Approach

The **flattened** approach means your workflow engine eventually sees a single “flat” DAG of steps. If subflows are also flattened, we might imagine a scenario like:

- At compile time, the DSL transforms each subflow’s steps into part of the parent flow, prefixing their slugs to avoid collisions.
- For a fanout, you might need “N copies” of the subflow’s steps, one copy per array element.

### 2.1 The Key Complication

If the array length is unknown at compile time, flattening is not straightforward:

- You cannot create a fixed number of steps at design-time, because you don’t know how many items will appear.  
- You’d have to dynamically insert steps into the DAG at runtime—meaning the “compiled” flow is incomplete until you see the array.  
- This dynamic insertion is not trivial: it could require altering the database schema or adding new step rows “on the fly,” which changes your flow’s shape in ways the engine may not expect.

### 2.2 Potential Workarounds

1. **Maximum Bound**  
   - You could artificially set a maximum array length (say 100 items) and flatten at compile time, ignoring or skipping the extra steps if you have fewer items.  
   - This is messy—wasteful for smaller arrays and possibly insufficient for bigger arrays.

2. **Dynamic Step Creation**  
   - Your engine might “clone” or “spawn” steps at runtime.  
   - This means the engine must be built to handle newly inserted steps mid-run. That’s a lot of complexity.

3. **Single Step with Internal Logic**  
   - Instead of representing each item with a distinct DB record, you might rely on a single “fanout” step that manually processes each item.  
   - But then you lose the built-in concurrency or separate step status tracking for each item. You also lose the ability to fail or retry them individually in a clean way.

### 2.3 Conclusion on Flattening

Flattening a “true fanout subflow” (with unknown N) can be **very challenging**. If your engine is not already designed for dynamic DAG expansion at runtime, the implementation overhead can be huge.  

---

## 3. A “Basic Mechanism” for Both Fanout Tasks and Subflows

An ideal solution might unify both:

- **Fanout tasks**: e.g., run the same function on each array element.  
- **Fanout subflows**: e.g., run the same subflow on each array element.

### 3.1 High-Level Idea

**Single “Fanout Step or Subflow” with Pluggable Logic**  
- You define some DSL construct, like `flow.fanout(sourceArraySelector, subflowDefinition)`.  
- At runtime, the engine sees that this step is special: it spawns multiple parallel runs of the “subflowDefinition,” each with one item from the array.  
- The engine merges the results into an array output that is aligned to the original array indices.

### 3.2 Implementation Sketch

1. **Fanout Step in DB**  
   - A step type: `step_type='fanout'`. This step references the subflow or the single-step logic that must be repeated.  
   - The engine knows how to “expand” or “execute” that fanout step by launching multiple “child tasks or sub-subflow runs” behind the scenes.

2. **Common Core for Both Single-Task and Subflow**  
   - The engine’s internal logic for fanout doesn’t care if it’s a one-step subflow or a multi-step subflow. The key is “Take an array, apply something repeatedly, gather results.”

3. **Challenges**  
   - The engine must track partial completions, partial failures, and how to handle indexing.  
   - If you want fully independent subflow concurrency, you still need a robust concurrency approach.  

With a carefully-designed “fanout step,” both single-step logic and multi-step subflows can be handled uniformly.

---

## 4. Going with Sub-Runs: Impact and .subflow() Abstraction

Because flattening an unknown-size fanout is so complex, many workflow engines prefer **true sub-runs**: each array item spawns a child run that references the same subflow “definition,” just with different input. Then the parent flow:

1. Waits until all child runs complete.  
2. Assembles their outputs in order.

### 4.1 Pros of Sub-Runs

- **No Need for Dynamically Expanding the DAG**  
  Each subflow is just a new run record in your DB. The “parent run” references it, but you are not injecting new steps into the parent’s DAG.  
- **Engine Reuse**  
  Each sub-run is scheduled and executed exactly like a normal run. No specialized logic to create “extra steps” on the parent side.  
- **Scalability**  
  Potentially you can spin up thousands of sub-runs in parallel if your system allows.

### 4.2 Impact on Subflow/Branching Abstraction

If everything is a separate run:

- **.subflow()** Implementation:  
  - Instead of flattening subflow definitions right away, calling `.subflow()` at runtime triggers a new run of a subflow ID.  
  - That subflow ID is a separate Flow definition in your DB (i.e., a fully versioned flow).  

- **Passing a `SubflowObject` Instead of a Callback**  
  - In a flattened approach, `.subflow((sub) => { ... })` typically merges or “inline compiles” the sub-steps.  
  - With sub-runs, you might instead pass or retrieve a `SubflowObject` that points to a stand-alone flow. The DSL might look like `flow.fanout( items, SubflowObject )`, meaning: spawn the subflow described by `SubflowObject` for each item.  
  - The parent’s DSL code becomes:  
    ```ts
    flow.fanout(
      (input) => input.run.items,
      SubflowObject("mySubflow_v2") // or something akin to that
    );
    ```
  - You can still preserve a DSL style that calls `.subflow()` and returns that `SubflowObject`, but ultimately it’s referencing a separate flow ID. The difference is it won’t flatten—rather, it spawns sub-runs with that flow ID and merges results when done.

### 4.3 Downsides

- **Separate Metaruns**  
  - You now must query multiple run entries to see the overall state.  
  - The UI must reflect that 20 child runs exist for the parent.  

- **Infrastructure Complexity**  
  - If your workflow system was simpler with only single-run DAGs, you now add an entire dimension of parent–child run orchestration.  

---

### Can We Still Use `.subflow()` for Implementation?

Yes—**.subflow()** can still exist in the DSL. But the meaning changes from “directly inline these steps into my parent flow” to “store a reference to a distinct flow or subflow object, and at runtime, spawn runs for it.”  

1. **At Code Definition**  
   ```ts
   const MySubflow = defineFlow("mySubflow", (sub) => {
     // sub steps
   });

   const ParentFlow = defineFlow("parentFlow", (flow) => {
     flow.fanout(
       (payload) => payload.items,
       MySubflow
     );
   });
   ```
   - The engine sees that `MySubflow` is a separate flow definition.  
   - The parent flow references it for a fanout step.  

2. **At Runtime**  
   - The parent run is created.  
   - When we get to the fanout step, we read the array length from parent’s data.  
   - For each item, we spawn a child run referencing “mySubflow.”  
   - We collect outputs once all child runs complete.

**That approach elegantly supports unknown array lengths,** because each child's subflow process is just a new run that can be started dynamically.

---

## Summary of Key Points

1. **Yes, Fanout is Often Needed**  
   - It’s a common scenario: parallelize processing for an arbitrary-length array.

2. **Flattened Approach is Possible… but Hard**  
   - If array length is not known until runtime, you’d have to dynamically add steps. Implementing that is not trivial.

3. **A Basic “Fanout Step”**  
   - One path is to implement a special step type in your engine that orchestrates sub-tasks or subflows in parallel and merges their outputs.  
   - This “fanout step” can handle both single-step logic (just a function) or multi-step logic (a subflow).

4. **Sub-Runs Are Often Simpler at Scale**  
   - Instead of flattening, spawn child runs for each array element.  
   - The DSL can still have `.subflow()`, but under the hood, it references a standalone subflow definition, invoked repeatedly.

5. **Passing a `SubflowObject` vs. Callback**  
   - In a flattening DSL, `.subflow(callback)` merges your sub-steps into the main flow.  
   - In a sub-run DSL, `.subflow()` likely returns a “flow reference” or `SubflowObject`. Then fanout or the parent flow just calls the subflow by ID.  

---

## Conclusion

Implementing array-based “fanout” with unknown sizing is a powerful feature but can be **extremely difficult** if you rely on a purely flattened DAG. Sub-runs (where each array element gets its own run) can drastically simplify concurrency and dynamic expansion—at the cost of extra run objects in your database.

If your prime concern is the complexity of “expanding” the DAG at runtime, **sub-runs** are the more straightforward path. You can still provide a user-friendly DSL like `.fanout([...items], MySubflow)` which behind the scenes launches multiple runs and merges outputs in order. Your `.subflow()` concept can remain intact as a convenient way to define or reference re-usable subflows, but it will revolve around a separate flow entity rather than inlining steps. 

In short:  
- **Yes, fanout is important.**  
- **Flattening with unknown array sizes can be done but is painful.**  
- **A “unified fanout approach”** is possible if you define a dedicated “fanout step” concept that can handle both single-step tasks and multi-step subflows.  
- **Sub-runs** are often the more **scalable** and **developer-friendly** solution, preserving a neat `.subflow()` abstraction without needing to do dynamic DAG expansions at runtime.
