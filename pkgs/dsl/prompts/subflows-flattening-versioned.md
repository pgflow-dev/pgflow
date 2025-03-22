# Comparing Two Approaches to Subflows in the Context of Versioning

This document analyzes two different ways of handling subflows (or “branching”) in a pgflow-like system and how they relate to versioning. We will refer to:

1. **Approach A**: Subflows are defined and stored as standalone `Flow` objects in the database, which can be referenced by parent flows.  
2. **Approach B**: Subflows (or “branches”) are appended (flattened) immediately into the parent flow in code, with slug-prefixing for isolation.

We will compare these approaches, focusing especially on how flow versioning plays out in each scenario.

---

## Background on Flow Versioning

pgflow’s versioning strategy is often approached by treating each flow definition as immutable once stored:

- Each flow definition stays unchanged in the database once uploaded.
- Changing a flow’s logic requires uploading a new flow slug (e.g., `myFlow_v2` instead of `myFlow_v1`).
- This explicitly separates old runs from new runs.
- It keeps flows simpler to reason about (no in-place updates that can lead to “half-upgraded” scenarios).

Subflow usage under this scheme means that if the subflow’s logic or steps need to change:
- Under Approach A, the user would upload a new version of the subflow flow slug.
- Under Approach B, changes to the subflow are effectively changes to the parent flow itself (flattened in the final DAG).

Below, we’ll walk through how each subflow approach interacts with this versioning model.

---

## Approach A: Standalone Subflows

### Description

In this approach:
1. Each subflow is a standalone `Flow` with its own slug.  
2. The parent flow references the subflow slug and sets up input/output mappings.  
3. The engine links them at runtime by storing a reference (e.g., parent run/step → subflow run).

Persistence-wise, subflows might store a `parent_run_id + parent_step_slug` in `pgflow.runs`, indicating that a subflow run is part of a higher-level run. Each subflow can also keep its own version slug.

### Versioning Impact

- **Independent Versioning**  
  Each subflow gets uploaded to the database under its own slug, say `payment_flow_v3`. If the subflow’s logic changes, you create `payment_flow_v4`. You then refer to `payment_flow_v4` from a new parent flow version if desired.
  
- **Reusability**  
  Multiple parent flows can reference the same subflow version or different versions of the subflow. For example, one parent flow might still use `payment_flow_v3`, while another references `payment_flow_v4`.
  
- **Clear Boundaries**  
  Because each subflow is its own entity with a slug, it is easier to see where the subflow boundary lies and which version is being invoked. You can introspect the table of flows to see exactly which subflows are used by each version of each parent flow.

- **Overhead in Management**  
  The main downside is that you must manage multiple database entries with potentially many flow slugs. In large systems, you might end up with many versions that you have to keep track of, along with their references.

In short, Approach A fits neatly with pgflow’s “immutable upload” versioning style. Each subflow is simply another flow that is also immutable. Parent flows can upgrade independently by referencing new versions of their subflows.

---

## Approach B: Flattened “Branches”

### Description

In this approach (sometimes called `.branch()` or `.subflow()` in the DSL):

1. You call a `.subflow()` (or `.branch()`) method on the parent flow.  
2. That subflow’s steps are immediately added (flattened) into the parent flow’s step list.  
3. Within the final DAG, each subflow step slug is internally prefixed (e.g., `branch1.some_step`) to avoid collisions.  
4. The subflow’s relative dependencies remain consistent, but it’s all stored and tracked as a single flow in the database.

Visually, you still see a subflow in code, but from the database perspective, it’s just one set of steps belonging to the parent flow, each slug forcibly prefixed.

### Versioning Impact

- **Single Flow Slug**  
  Because the subflow is flattened, you end up with a single flow slug representing the entire DAG. If you need to update the subflow steps, you’re effectively changing the entire parent flow. This means you deploy a new version of the parent flow (e.g., `parent_flow_v2`) to incorporate changed “subflow” steps.
  
- **No Independent Subflow Versions**  
  There isn’t a separate, independently tracked `Flow` object in the database. You cannot keep a stable “payment_flow_v3” that is reused, because it is not actually stored as its own entity. It is always merged into the parent when you `.subflow(...)`.
  
- **Simplicity in Code**  
  From the user’s perspective in TypeScript code, it can be very straightforward: you just define a “branch” in the function syntax. There’s no separate “upload the subflow flow” step.  
  However, from a pure versioning viewpoint, it’s less flexible. You can’t upgrade the subflow independently—any subflow change triggers a new *parent flow version*.  

- **Potential Duplication**  
  If multiple parent flows want the same subflow logic, each (parent) flow is storing that subflow’s steps. This can lead to duplication across multiple flows (and multiple places to update if you want consistency among them).

---

## Which Approach Is Easier to Use with Immutable Versioning?

It depends on your needs:

1. **Approach A (Standalone Subflows)**  
   - **Pros**:  
     - One subflow flow slug can be easily versioned and referenced by multiple parents.  
     - Easier to see which version of the subflow is used.  
     - Ideal if you need a truly reusable piece of logic across many flows.  
   - **Cons**:  
     - Requires managing references between parent flow versions and subflow versions.  
     - Slightly more overhead in “flow slug management” in the DB.

2. **Approach B (Flattened Branches)**  
   - **Pros**:  
     - Simpler to read or write in code, as you “just add steps” without referencing a second flow.  
     - No special subflow DB entries or separate subflow run records.  
   - **Cons**:  
     - Not reusable as a separate entity (changing subflow requires a new version of the entire parent flow).  
     - Potential duplication if the same subflow logic is used across many flows.  
     - Harder to maintain an organized version history of subflows because each subflow is “encapsulated” within a parent flow version.

From a purely versioning standpoint, **Approach A** aligns more directly with pgflow’s principle of immutable flows: You can create and track separate versions of the subflow and clearly see which parent flows reference them. **Approach B** remains attractive for simpler or “one-off” subflows that don’t need to be used anywhere else.

---

## Conclusion

- If you want robust, maintainable versioning paths for subflows—where the same subflow logic might change independently and be referenced by multiple parents—Approach A is likely better. You will have a more explicit, consistent way to handle updates across multiple flows.
- If your subflow is more like a local branch logic snippet, needed only by that parent flow, and you don’t expect to reuse it, Approach B can be simpler. You’ll still keep an immutable “parent flow version,” but you won’t have to track a separate subflow slug.

Ultimately, your choice depends on how often you expect subflows to be reused, how critical their independent versioning is, and whether you want the subflows to appear as first-class flows in the database. For official “reusable building blocks,” a separate flow slug per subflow (Approach A) is typically the most consistent with a versioned, immutable database model.
