# Structuring Complex Generic Types: A Methodology

Designing and iterating on complicated generic types can be overwhelming. Below is a structured approach to planning and implementing them effectively.

---

## 1. **Start with a Conceptual Sketch (Top-Down)**
- **Describe the ideal API usage first.**
  - Example:
    ```ts
    const flow = new Flow<GlobalRun>()
      .step({ slug: 'A' }, (input) => 'some output')
      .step({ slug: 'B', dependsOn: ['A'] }, (input) => input.A + 'some other stuff');
    ```
  - Focus on:
    - What inputs should appear in each handler.
    - What methods should return (e.g., a new `Flow` with updated types).

---

## 2. **Identify Key "Entities" in Your Type System**
- Common entities:
  1. **Top-level run payload type** (e.g., `GlobalRun`).
  2. **Record of steps** (slug → output).
  3. **Step definition** (slug, dependencies, handler).
  4. **Step input type** (e.g., `StepPayload`).

- Ask:
  - *What are we storing?*
  - *How do relationships appear in runtime vs. types?*

---

## 3. **Sketch Core Building Blocks (Bottom-Up)**
- Define small utility types for each concept.
- Example:
  ```ts
  export type StepPayload<TGlobalRun, TAllSteps, TDepSlugs> = {
    run: TGlobalRun;
  } & Record<TDepSlugs, TAllSteps[TDepSlugs]>;
  ```
- Keep generics minimal initially—expand as needed.

---

## 4. **Build the Main Container Type**
- Define the `Flow` class with generics:
  - Typically: `TGlobalRunPayload` + `TStepsSoFar`.
  - Each `.step()` should return a new `Flow` with merged steps.

- Key questions:
  - *What does `.step()` accept?* (slug, deps, handler).
  - *What does it return?* (Updated `Flow<TGlobalRun, TSteps>`).

---

## 5. **Iterate and Refine**
- Test with real code to uncover needed tweaks:
  - Add constraints (e.g., `extends Record<string, Json>`).
  - Rename generics for clarity.
- Refactor aggressively—types evolve with usage.

---

## 6. **Use "Stubs" or "Spikes" for Uncertainty**
- For unclear parts, use placeholders (e.g., `any`):
  ```ts
  export interface Flow<TGlobalRunPayload, TSteps> {
    // Methods added later...
  }
  ```
- Validate with minimal test cases:
  ```ts
  const fx = new Flow<GlobalRun, {}>();
  fx.step(/* ... */);
  ```

---

## 7. **Maintain a Minimal Working Example**
- Keep a small, compilable snippet to validate changes:
  ```ts
  const MyFlow = new Flow<{ url: string }, {}>('example_flow')
    .step({ slug: 'A' }, (input) => input.run.url);
  ```
- Use compiler feedback to guide refinements.

---

### **TL;DR: Workflow Summary**
1. **Top-Down**: Define ideal usage first.
2. **Entities**: Identify core type relationships.
3. **Bottom-Up**: Build utility types (e.g., `StepPayload`).
4. **Integrate**: Wire utilities into the main type (`Flow`).
5. **Iterate**: Refine with real usage and constraints.
6. **Validate**: Use minimal examples to check correctness.

This back-and-forth (conceptual → implementation → validation) is key to robust generic designs.