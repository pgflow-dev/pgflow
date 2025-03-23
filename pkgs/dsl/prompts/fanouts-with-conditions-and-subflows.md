# Analyzing the Impact of `runIf` / `runElse` and Subflows with Potential Fanout

This document explores how the upcoming _conditional logic_ (`runIf` / `runUnless`) and _subflows/branching_—specifically with flattening but keeping a `parent_subflow_slug` column and `step_type = subflow`—can set the stage for a **fanout** mechanism. “Fanout” in this context means that one step or subflow would produce an array of items, and each item would spawn its own parallel step or subflow execution.

We will revisit the previously discussed abstractions (flattening subflows vs. separate runs vs. a “middle ground” approach) and analyze how adding a fanout concept interacts with conditions (`runIf` / `runUnless`) in each case. The goal is to strike a balance between **MVP simplicity** and future extensibility.

---

## 1. Introduction and Background

### 1.1 Conditional Execution with `runIf` & `runUnless`
In the near-future implementation, each step can optionally be guarded by conditions:

- **`runIf`**: The step runs if this condition is **true** given the step’s input.
- **`runUnless`**: The step runs if this condition is **false** given the step’s input.

Any step for which these conditions fail is marked **`skipped`**. Transitive dependencies down the line also get skipped.

### 1.2 Subflows / Branching with “Flattened Steps” & `parent_subflow_slug`
We plan to store subflows in the same `steps` table as a “flattened” structure but with:

- A `step_type` column (e.g. `subflow` vs. `normal`).  
- A `parent_subflow_slug` so we can group subflow steps.
- The possibility of referencing subflow-wide configuration in a “subflow step.”

This approach acts as a middle ground between:

1. *Fully flattening* subflow steps (just name them differently).  
2. *Fully separate runs* for each subflow (with separate run IDs).

With the “flattened-with-parent” approach, everything remains within the same run ID, but we can identify subflows as distinct groups.

### 1.3 The New Fanout Concept
A **fanout** instructs the engine to spawn multiple tasks or sub-subflows in parallel when the input is an array (or some multi-value structure). For a normal step, setting a flag like `fanout: true` (or a more structured property like `fanout: { path: "someArrayField" }`) could cause creation of N parallel tasks, one per array element. For a subflow, this approach would run the entire subflow once per array item, also in parallel. Either way, we want the step DSL to handle:

- `runIf` / `runUnless` as usual.  
- `fanout` as an **additional** or **alternative** property.

The idea is to keep the design MVP-friendly: minimal friction, consistent with how we already define conditions or branching.

---

## 2. Revisiting Flattening vs. Keeping a `parent_subflow_slug`
### 2.1 Flatten-Only Approach
If we were to flatten subflows entirely without references to a parent subflow entity, implementing fanout might require:

- Marking each expanded step with a unique slug suffix per array item.
- Dealing with a large blow-up in the steps table for big arrays.

**Pros:**
- Very direct: one steps table, everything is expanded in a single dimension.
- Minimal changes to dependency resolution.

**Cons:**
- Harder to see subflow groupings in the DB or UI.
- Potentially large expansions for big fanouts.

### 2.2 Using `parent_subflow_slug` (and `step_type = subflow`)
If each subflow is recorded as a special step row (e.g. `step_type = subflow`), then child steps are associated with the subflow’s slug. This approach is especially helpful for:

- **Visibility**: We can quickly see which steps belong to subflow “X” or “Y.”
- **Configuration**: Subflow-wide overrides (like `maxAttempts`).
- **Dependency Handling**: The parent flow can treat the subflow as a single “virtual step,” while the engine internally expands it.

**Where Fanout Fits**  
With subflows, if we set `fanout: true` on that subflow root, the engine would spawn one parallel subflow instance per array element. Each instance has the same internal steps. This remains a “flattened” approach under the hood, but the system can group them by subflow ID or `parent_subflow_slug` plus an index for each array item.

---

## 3. Potential Implementation of Fanout + Conditions

### 3.1 Adding a `fanout` Property in Parallel to `runIf` / `runUnless`
We could treat **fanout** as a top-level property on the step definition, e.g.:

```ts
flow.step(
  {
    slug: "ProcessItems",
    dependsOn: ["FetchArray"],
    runIf: {...},
    runUnless: {...},
    fanout: {
      path: "items",      // or a boolean if there's only one array
      concurrency?: 5     // optional concurrency limit
    },
  },
  handlerFn
);
```

**Behavior**:
1. **Condition Check** (`runIf`, `runUnless`) – If the conditions fail, the entire step is `skipped`, no tasks are spawned.  
2. If not skipped and `fanout` is set – The engine looks up the array at `payload.items` and spawns one “task” (or subflow instance) per element.  
3. Each parallel instance has the item data embedded in its payload.

### 3.2 Subflows with Fanout
When “fanout: true” is specified on a subflow root step:

1. The subflow root step is repeated for each array element.  
2. All child steps of that subflow are repeated accordingly.  
3. The final aggregated output is typically an array of subflow outputs.

**Challenges**:
- **Skipping**: If `runIf` fails on the subflow root, the entire subflow is skipped.  
- **Mixed Condition**: Potentially each item in the array could have a different condition outcome. If the condition depends on that item, you might skip some items but not others. 
- **Aggregating Results**: The engine needs a consistent way to merge all partial or skipped results back.  

---

## 4. Challenges Combining Conditions + Fanout

1. **Per-Item Condition Checking**  
   For a fanout step, we might want to do `runIf` at the item level. For example, only spawn tasks for items that meet a certain criterion. This might require a “filter” concept or skipping logic per item.

2. **Complexity in UI**  
   If a subflow fans out to 1,000 items, we don’t want to see 1,000 sub-step expansions in a naive interface. We may need summarizations or chunking.

3. **Transitive Dependencies**  
   If a subflow or step fans out, its downstream steps must wait for all parallel tasks or subflows to complete (unless we have more advanced partial-latching conditions). A “runIf” might skip the entire set or skip partial subsets.

4. **Performance**  
   Large fanouts can generate many tasks. We need to ensure our scheduling and skipping logic in the database is efficient.

Despite these challenges, the core conceptual structure stays the same: we store subflows with a `parent_subflow_slug` or `step_type`, use conditions to skip steps, and add a new concept for spawning parallel tasks when the input is an array.

---

## 5. Emphasizing MVP Readiness Over Complexity

A recommended MVP approach to keep things simple:

1. **Allow a Boolean `fanout` or a basic `fanout: { path: string }`.**  
   - If `fanout: true`, we assume the entire input to this step is already an array.  
   - If `fanout: { path }`, we look up `payload[path]` at runtime.

2. **Apply `runIf` / `runUnless` at the step level**  
   - If conditions fail, skip the entire fanout step.  
   - In the first iteration, do not provide a built-in mechanism for skipping _some_ items but running others. That can be a future enhancement.

3. **In subflows**, if `fanout: true` is on the subflow’s root, fan out the entire subflow.  
   - One subflow instance per array element.  
   - All sub-steps reference the per-item context.  
   - This keeps each item neatly grouped in subflow “batches,” and the parent sees it as a single entity (the root step or subflow aggregator).

4. **Keep the schema additions minimal.**  
   - Possibly store a `fanout_config jsonb` next to `run_if_condition` / `run_unless_condition`.  
   - Use existing “skipped” statuses for steps or tasks.

This incremental approach yields some immediate wins:

- Parallel item processing out of the box.  
- Condition-based skipping.  
- Subflows remain a single “block,” which can also be fanned out if needed.

---

## 6. Illustrating Fanout + Conditions in Each Subflow Abstraction

### 6.1 Flattened Only
- Steps for each item plus `_index` appended to the step slug.  
- `runIf` / `runUnless` applies to the entire set; either everything gets spawned or everything is skipped.  
- Some difficulty grouping & referencing subflow blocks if the array is large.

### 6.2 Flattened With `parent_subflow_slug`
- Mark the root subflow step with `step_type = subflow`.  
- If `fanout = true` on that subflow step, it spawns N subflow “instances.”  
- For each instance (i.e., each array item), the steps all share a consistent subflow group ID plus an index.  
- The engine aggregates them at the subflow root or final subflow aggregator step.

### 6.3 Full Separate Runs for Each Item
- You’d create a new run for each array item.  
- Overkill for an MVP. This approach quickly becomes complex, though it’s highly decoupled.

---

## 7. Creative Ideas for Simplicity

1. **Single “Fanout Step” Type**  
   Instead of layering `fanout: true`, define `step_type: 'fanout'`. This might reduce confusion by clarifying that the step always has multiple tasks.

2. **`runIf` as an Inline Filter**  
   Instead of skipping the entire step, allow a filter expression to remove some items from the array automatically. (“If item.status != 'active', skip that item.”)

3. **Hybrid Condition + Fanout Logging**  
   For debugging, store “item-based skip logs” to show which items were processed or skipped.

4. **Parallelism Limits**  
   A simple concurrency or “max parallel” property could avoid large floods of tasks in enormous fanouts.

5. **Subflow Post-Process**  
   Let the subflow aggregator define a single “merge” function that processes all item outputs, especially for conditions that skip a subset of items.

---

## 8. **Unexpected Alternative Solutions**  
Below are five novel ideas that combine conditions, subflows, and fanouts in ways not previously explored in depth:

1. **Conditional Fanout at the Item Level**  
   Instead of skipping the entire step if `runIf` is false, do a partial item-level condition. For example, feed the array into a small function that returns only the items that pass `runIf`. Then only those items spawn tasks. This is a “built-in filter step.”

2. **Multi-layered Subflows with Dynamic Fanout**  
   A subflow might itself produce an array for another deeper subflow fanout. This vertical layering allows a “fan-out, gather, fan-out again” approach. At each subflow boundary, you can apply `runIf` or `runUnless` to skip entire sub-layers.

3. **Fanout as a Separate “Split” Step**  
   Instead of toggling a property on a normal step, have a dedicated “split” step that transforms a single object into multiple “emit” events. Each “emit” becomes a parallel path. Then, an optional “join” step merges them back. This more explicitly models fanout/fanin concepts.

4. **Conditional Subflow Branch**  
   Combine “branching logic” with fanout by letting a subflow pick which internal steps to spawn based on item-level conditions. The subflow might skip half its steps or sub-branches per item. This is more of a “decision tree” built within the subflow.

5. **DSL-Level Macros**  
   Introduce a DSL macro that auto-generates subflows for each item, each with its own runIf/unless. The user writes a single step, and the macro expands it behind the scenes. In effect, you write a simple block, and it compiles down to a set of parallel runIf-laden steps or subflows in concurrency form.

---

## 9. Conclusion and Final Recommendation

Summarizing the key points:

1. **Conditions + Fanout Fit Well Together**  
   - Mark a step or subflow with `runIf` / `runUnless` to decide if it should execute at all.  
   - If not skipped, a `fanout` property spawns parallel executions for each array item.

2. **Flattened Approach with a “Subflow Step”**  
   - Recommend continuing with the plan to store subflows in the same run, but label them with `step_type = subflow` and `parent_subflow_slug`.  
   - This approach maintains a single run while still letting the DB and UI group subflow steps.

3. **MVP-Ready, Minimal Implementation**  
   - Keep “fanout” either a simple boolean or a small config like `fanout: { path: "myArray" }`.  
   - Handle skipping at the top-level step first (all-or-nothing). Future expansions can filter per item.

4. **Adopt Simple Aggregation**  
   - When a fanout step completes, produce an array of outputs. For subflows, gather final step outputs from each parallel instance.  
   - The aggregator can be a single “virtual step” or the subflow root that marks when all parallel tasks/subflows finish.

5. **Balance Complexity Against Clarity**  
   - Provide enough detail to handle real-world array processing in parallel.  
   - Avoid partial-skip complexities in an initial MVP. That can be introduced later as a “filtered fanout” or “conditional item-level skip.”

By following this path, you keep the schema changes small, the runtime logic consistent with existing `skipped` status, and lay the foundation for robust parallelization scenarios. The net result is a flexible, developer-friendly approach to conditions, subflows, and fanout—without incurring unnecessary complexity upfront.
