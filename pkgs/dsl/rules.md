# Report on Issues with the Flow DSL Implementation

Below is a comprehensive analysis of where the current implementation deviates from the stated requirements:

---

## Requirement Recap

1. **DependsOn is strongly typed and allows only selecting steps added before the current step**  
   In other words, at compile time, a new step’s `dependsOn` array must only accept reference slugs from steps that were already defined (i.e., appear earlier in the chain).

2. **The `input` argument of a step’s handler is strongly typed by:**
   - The flow’s `RunPayload` (available under the key `run`).
   - The return types (outputs) of all and only those dependencies (each dependency’s slug is a key, and the value is the dependency’s return type).  

3. **`getStepDefinition()` should return a `StepDefinition` whose `handler` input type matches exactly the same structured type described in #2**  
   That is, if step `B` depends on step `A`, then the `handler` input type for `B` (both at definition time and via `getStepDefinition("B")`) should be `{ run: RunPayload; A: ReturnTypeOfA }`.

---

## Problems Identified

### 1. No Enforced “Order Awareness” in `dependsOn`

The current typing for `dependsOn` is:

```ts
Deps extends Extract<keyof Steps, string> = never
```

While this ensures the dependency slug must be *some* valid key in `Steps`, it does **not** ensure that it’s a step which appears *before* the current step in the chain. The only runtime check is:

```ts
if (!this.stepDefinitions[dep as string]) {
  throw new Error(`Step "${slug}" depends on undefined step "${dep}"`);
}
```

This confirms the step is defined somewhere in the flow, but it does **not** confirm it was defined earlier. In effect, you can create forward references.  

**Why this is a problem**:  
The DSL requirement says a step should only depend on steps that come before it, so that:  
1. TypeScript knows the step definitely exists.  
2. The execution order is guaranteed to make sense.  

Without compile-time “order awareness,” the user could accidentally place a step’s name in `dependsOn` even though that step is declared later in the chain.  

---

### 2. Mismatch Between Actual Handler Input and the `StepInput` Utility

Your `step` method does this:

```ts
Payload = { run: RunPayload } & { [K in Deps]: Steps[K] }
```

That means if you say `dependsOn: ['foo', 'bar']`, the handler’s `payload` type is indeed  
`{ run: RunPayload; foo: Steps['foo']; bar: Steps['bar']; }`.  

**However**, in `getStepDefinition`, you do:

```ts
getStepDefinition<SlugType extends keyof Steps>(
  slug: SlugType
): StepDefinition<
  StepInput<RunPayload, Steps, string & SlugType>,
  Steps[SlugType]
> {
  // ...
  return this.stepDefinitions[slug as string] as unknown
   as StepDefinition<StepInput<RunPayload, Steps, string & SlugType>, Steps[SlugType]>;
}
```

And `StepInput` is defined to be:

```ts
export type StepInput<
  TRunPayload extends Json,
  TSteps extends Record<string, Json>,
  TStepSlug extends string
> = TStepSlug extends keyof TSteps
  ? { run: TRunPayload } & {
      [K in Exclude<keyof TSteps, TStepSlug>]: TSteps[K];
    }
  : { run: TRunPayload };
```

This effectively injects **all** of the flow’s step outputs into the input, except for the step’s own slug. That means the input type for step `foo` becomes `run` plus the entire set of other steps in the flow (`bar`, `baz`, etc.), not just those steps declared via `dependsOn`.  

**Why this is a problem**:  
- It clashes with the design in your `step` method, which type-checks the handler to only see the steps it actually depends on.  
- The DSL requirement states the handler input must be strongly typed by **exactly** the return values of its **declared** dependencies. That is, if a step depends only on `foo`, there should not be extra properties like `bar` or `baz` in the input type.  
- `getStepDefinition` is supposed to yield the same strong, minimal input for the handler that was declared at step-creation time, but right now it yields a more permissive shape.

---

### 3. `getStepDefinition` Does Not Properly Reflect “Only the Declared Dependencies”

Due to the same mismatch noted above, `StepDefinition<Payload, RetType>` from `getStepDefinition` is not describing the narrower type that only has the step’s declared dependencies + `run`. Instead, it uses a type that has effectively “all other steps in the flow.”  

This violates the requirement:
> “`getStepDefinition()` should return a `StepDefinition` that holds exactly the same strong types for the handler function input […]”

---

## Summary

To summarize:

1. **No ordering constraint**: The code does not enforce that a newly declared step can **only** depend on steps that truly appear **before** it in the chain. The type constraint `Deps extends keyof Steps` does not reflect an order-based restriction, only a membership restriction.

2. **Excessive properties in `getStepDefinition`**: `getStepDefinition` uses a `StepInput` type that includes all prior step outputs (minus the step itself) instead of just the step’s declared dependencies.

3. **Type mismatch between the step’s actual handler and the `StepDefinition`**: Internally, the `step` method uses a narrower shape for `payload` than is ultimately stored or returned by `getStepDefinition`. As a consequence, the strong typing for the actual runtime handler arguments does not match the strong typing the system returns via `getStepDefinition`.

These issues collectively mean the current implementation does not adhere to the three stated requirements governing dependency order, exact step input shape, and correct `StepDefinition` type consistency.
