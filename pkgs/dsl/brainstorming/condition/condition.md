# Conditional Skipping Feature in pgflow DSL

This document provides a comprehensive overview of how to implement conditional skipping (as described in [condition.md](../core/prompts/condition.md)) for workflow steps in **pgflow**. It covers:

- Why conditional skipping could be valuable, even at an MVP stage
- Pros and cons of implementing it
- Possible struggles or pitfalls
- Estimated effort (in hours) to implement

---

## What Is Conditional Skipping?

In many workflows, certain steps only make sense to run under particular conditions. For example:

- You might only want to download a file if a certain flag was provided in the input.  
- You might want to do summarization or sentiment analysis only if the previous steps indicate a specific data pattern.

“Conditional steps” allow you to define a JSON-based condition in the step’s metadata (e.g., `runIf` or `runUnless`) that automatically determines whether the step should run or be “skipped.” If a step is skipped, steps that depend on it are also skipped.

---

## Why It May Be Valuable for an MVP

1. **User Experience & Flexibility**  
   - Immediate advantage for users who need branching logic.  
   - Allows simpler workflows without requiring external condition-checking in the code.

2. **Reduction in Unnecessary Processing**  
   - If the condition is not met, the step (and its dependents) will skip automatically, saving computational resources and time.

3. **Clearer Workflow Semantics**  
   - By making conditions an explicit feature, you avoid confusion and keep the logic in one place (the flow definition) rather than scattering it between application code and partial definitions.

4. **Encourages “Flow-Based” Mindset**  
   - Eliminates the need for users to manually handle branching logic in external scripts or custom code.  
   - Aligns with a “batteries included” approach that is often helpful for early adopters.

---

## Pros and Cons

### Pros

- **Encourages Declarative Workflow Rules**  
  Users can keep logic in the same domain as the flow definition, which makes reading and maintaining flows simpler.
- **Reduces Boilerplate**  
  Instead of manually checking inputs at the beginning of a handler and deciding whether to no-op or fail, the step can be automatically skipped.
- **Potential for Greater Adoption**  
  A built-in conditional system often increases trust and usage among developers familiar with high-level workflow or DAG systems.
- **Cleaner Downtime**  
  Skipped steps do not consume resources (no tasks enqueued, no worker overhead).

### Cons

- **Extra Implementation Complexity**  
  You must handle edge cases, such as partial input conditions, data type subtleties, or the JSON containment operator usage in PostgreSQL.
- **Increased Maintenance**  
  Introducing more logic in your DSL means more code to test and maintain (e.g., must handle backward compatibility if you change how conditions work in the future).
- **Potential for Confusion**  
  If the condition syntax is not user-friendly, or if debug messages about skipping are not clear, users could be confused about why certain steps did not run.

---

## Possible Struggles & Pitfalls

1. **Correctly Handling JSON Conditions**  
   - Relying on the JSON containment operator `@>` means carefully constructing the query or expression.  
   - Must confirm that partial matches and data mismatches are handled as expected (e.g., numeric vs. string type).

2. **Maintaining Type Safety**  
   - If the DSL automatically infers types, adding a `runIf` or `runUnless` property must still be type-safe.  
   - If referencing a step’s output in the condition, the system should ensure that property actually exists.

3. **Edge Cases with Skipped Steps**  
   - Skipping means “completing” with no output—how do you handle downstream steps that expect data from a skipped step?  
   - You may need a convention in your DB or runtime state indicating that the step is “skipped” rather than “completed” or “failed.”

4. **Backward Compatibility**  
   - If you release an MVP and later refine the condition syntax, you’ll need a migration or transitional logic for existing flows.

---

## Difficulty of Implementation

Implementing this feature touches multiple layers of the system:

1. **DSL Layer**  
   - Defining new options (`runIf`, `runUnless`) that users can provide.  
   - Ensuring these options are typed properly in TypeScript.

2. **API / Database Layer**  
   - Storing the condition JSON in `steps` (or an equivalent) so that it can be evaluated at runtime.  
   - Updating your state transition logic to evaluate the condition before starting a step.

3. **Runtime Execution Flow**  
   - Where you currently mark a step as “ready,” insert a check to see if conditions pass. If they do not pass, mark as “skipped.”  
   - Skip all dependent steps, or propagate the skip state as needed.

4. **Testing & Debugging**  
   - You’ll likely want multiple test scenarios: conditions that pass, conditions that fail, partial matches, data type mismatches, etc.  
   - Logging or debug statements so developers can see clearly why a step is skipped.

Given these considerations, the feature is not trivial, but it is also not the largest feature you could add. It primarily requires changes in the step lifecycle logic, the database schema or metadata handling, and a bit of additional DSL syntax.

---

## Estimated Time to Implement

Below is a rough breakdown of tasks and potential time estimates:

1. **Design & Schema Updates** (2–4 hours)  
   - Decide how to store the condition in the `steps` table (e.g., additional `condition` JSONB column).  
   - Optionally add an ENUM or a text field for “skip logic type” (runIf, runUnless, etc.).

2. **DSL Adjustments & TypeScript** (3–5 hours)  
   - Add `runIf` / `runUnless` options to your step definition in TypeScript.  
   - Ensure thorough type checks so that the condition references existing fields.

3. **Execution Logic** (4–6 hours)  
   - Modify the function that transitions a step from “pending” to “ready” to evaluate the condition.  
   - Add skip logic if the condition fails.  
   - Propagate skip status to dependent steps.

4. **Testing & Docs** (3–5 hours)  
   - Write integration tests for basic and complex scenarios.  
   - Document the feature thoroughly, including examples that show how to define a condition, how skipping is reported, etc.

**Total Estimated Range**: ~12–20 hours

This is a ballpark estimate assuming familiarity with the pgflow codebase and the underlying PostgreSQL mechanics. It will vary depending on specific architecture, team skill set, and how thoroughly you wish to test or document the new feature.

---

## Conclusion

Implementing conditional skipping can bring significant value, even for an MVP. It grants your users more control over their flow logic, potentially reduces redundant work, and keeps logic centralized in the workflow definition. The feature does introduce additional complexity and might take around 12–20 hours to implement thoroughly, covering design, DSL changes, database-level adjustments, and testing.

If your MVP’s core promise is to deliver a robust, easy-to-use workflow engine, adding conditional skipping early can differentiate your project by showcasing advanced flow capabilities and reducing the need for external branching logic. If time is tight, you could defer some of the advanced type-safety checks or skip certain advanced condition edge cases—but the fundamental skipping mechanism itself is likely beneficial enough to justify the investment for most workflows.
