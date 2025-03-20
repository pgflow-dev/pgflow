## Plan for Rewriting the Old DSL into the New DSL

Below is a step-by-step plan to migrate from the “old” DSL style (as in `src/flow.ts`) to the “new” DSL style indicated by `src/new-dsl.ts`. This plan preserves and refines type inference, retains type-safety, and introduces an options-based approach for both `Flow` and individual steps.

---

### 1. Introduce a New Options Interface for the Flow

In the new DSL, the `Flow` class constructor accepts an **options object**, where `slug` is required but the rest of the properties (`maxAttempts`, `baseDelay`, `timeout`) are all optional. You might define something like:

```ts
interface FlowOptions {
  slug: string;
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
}
```

**Plan details:**

1. Create the `FlowOptions` interface (or a similarly named interface) with the required `slug` plus the optional properties.
2. Inside the `Flow` class, add a parameter of type `FlowOptions` to the constructor. Example:
   ```ts
   constructor(public flowOptions: FlowOptions, stepDefinitions: Record<string, StepDefinition<Json, Json>> = {}) {
     this.flowOptions = flowOptions;
     this.stepDefinitions = stepDefinitions;
   }
   ```
3. Replace the older zero-argument constructor with the new one that accepts an `options` object and step definitions.

---

### 2. Create a Step Options Interface

Each step needs to take a **single options object** instead of separate `name`, `deps[]`, etc. The new DSL uses properties like `slug`, `dependsOn`, `maxAttempts`, `baseDelay`, `timeout`. We also want to ensure `slug` is mandatory while others are optional. For instance:

```ts
export interface StepOptions {
  slug: string;
  dependsOn?: string[];
  maxAttempts?: number;
  baseDelay?: number;
  timeout?: number;
}
```

**Plan details:**

1. Replace the old overload pattern:
   ```ts
   step<Name extends string, RetType>(name: Name, handler: ...)
   step<Name extends string, RetType>(name: Name, dependencies: ..., handler: ...)
   ```
   … with a **single** signature of the form:
   ```ts
   step<RetType>(opts: StepOptions, handler: (payload: ...) => RetType | Promise<RetType>): ...
   ```
2. Ensure `slug` is the only required property on `StepOptions`, aligning with `step({ slug: "...", ... }, handler)` usage.
3. Internally, treat `dependsOn` as the old `dependencies` array, but rename it for consistency in newly stored `StepDefinition`.

---

### 3. Adjust the Internal StepDefinition / Flow Logic

Right now, `StepDefinition` has a few properties:

```ts
export interface StepDefinition<Payload extends Json, RetType extends Json> {
  name: string;
  handler: (payload: Simplify<Payload>) => RetType | Promise<RetType>;
  dependencies: string[];
}
```

**Plan details:**

1. Rename `name` to `slug` when you create the new `StepDefinition`. That is, if the user passes `opts.slug`, store that as `slug` in the internal `StepDefinition`.
2. For `dependsOn`, store it in `dependencies`. (E.g. `dependencies: opts.dependsOn ?? []`).
3. The other optional keys (`maxAttempts`, `baseDelay`, `timeout`, etc.) should **not** be stored inside `StepDefinition` - we only need them at runtime for scheduling/retries and the will fall back on flow options if not provided for step. You must store them in a side structure.

---

### 4. Preserve Type Inference for Step Input and Output

In the old DSL, we pass:

```ts
step<Name extends string, Deps extends keyof Steps & string, RetType extends Json, Payload extends {...}>
```

**Plan details:**

1. Keep the `Flow` definition generically typed on `RunPayload` and an aggregated `Steps` type.
2. As you define the new `step(opts, handler)`, derive `Deps` from `(opts.dependsOn || [])`. This means:
   - Extract the dependencies from the existing “accumulated” steps in `Steps`.
   - Build a `Payload` type that merges `{ run: RunPayload } & { [K in Deps]: Steps[K] }`.
3. Return a **new** Flow instance with updated `Steps` after each `step`. This ensures that each subsequent call to `.step(...)` receives updated type information from previously added steps.
4. By referencing `opts.slug` as the new step’s key (instead of the old positional `name` argument), we automatically preserve the name → return type mappings that feed into `Steps`.

---

### 5. Migrate Existing Code

**Example old usage:**

```ts
const MyFlow = new Flow<{ value: number }>()
  .step("rootStep", async (payload) => ({ doubledValue: payload.run.value * 2 }))
  .step("normalStep", ["rootStep"], async (payload) => ...);
```

**Example new usage:**

```ts
const MyFlow = new Flow<{ value: number }>({ slug: "my_flow", maxAttempts: 3 })
  .step(
    { slug: "rootStep" },
    async (payload) => ({ doubledValue: payload.run.value * 2 })
  )
  .step(
    { slug: "normalStep", dependsOn: ["rootStep"] },
    async (payload) => ...
  );
```

**Plan details:**

1. Change your code instantiations of `Flow` to use the new constructor signature that requires an options object.
2. For each invocation of `.step(...)`, replace the old `(name, [dependencies], handler)` or `(name, handler)` with `( { slug: name, dependsOn: ... }, handler )`.
3. For other optional props (like `maxAttempts`, `baseDelay`, `timeout`), place them in the first parameter object of the `.step`.

---

### 6. Validate Runtime Logic for Retries / Timeouts

DSL only stores optional keys for now, in a side object, so it will be easier to extend later: `maxAttempts`, `baseDelay`, or `timeout`.

No need to provide any runtime logic for those, only type them as optional numbers and store them so they can be referenced for particular step, ideally when getting a particular step they will be returned with it.

---

### 7. No need for backward compatibility

This tool is unreleased yet and we completely get rid of previous implementation.

---

## Summary

By moving from the “positional arguments” DSL to an “options object” DSL, you gain flexibility (adding new optional properties without expanding function overloads) and clarity (the properties `slug`, `dependsOn`, `maxAttempts`, `timeout`, etc. are all named). Type inference is preserved by carrying forward the essential generics and merges that produce strongly typed step results. This plan outlines the important refactors and architecture changes to keep everything type-safe and future-proof.
