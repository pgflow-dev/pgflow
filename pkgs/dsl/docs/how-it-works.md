## 1. How the Core Pattern Works

1. **Flow carries around a generic type of what we currently “know”** about the step outputs.

   - `Flow<RunPayload, Steps>` is parameterized by the global “run” payload and an evolving set of step output types (`Steps`).

2. **`step` returns a new Flow** whose `Steps` type is augmented with the new step’s output type.

   - Every time you call `.step(...)`, you return a new type that merges the old `Steps` record with `{ [K in NewStepSlug]: Awaited<NewStepOutput> }`.
   - This means TypeScript can track the output of each step, so that any future step has it in the type domain.

3. **A step’s payload type** is built from:

   - `{ run: RunPayload }`
   - Plus the outputs of any listed dependencies.

4. **An appropriate `StepDefinition`** is constructed that uses these types for the parameters and return values.

By chaining `.step()`, you get the same “builder pattern” in TypeScript that collects the outputs and feeds them into the next step’s input type. This is exactly how you end up with strong inference from the previously defined steps.

---

## 2. Handling Step Inputs & Outputs

The tricky part is to ensure the correct input type is assembled from:

- The global “run” payload each time,
- All the dependency step outputs.

You’re doing this via your `StepInput` type and by ensuring that each `step` invocation infers a `Payload` that is `{ run: RunPayload } & { [K in Deps]: Steps[K] }`. This is precisely the trick you need so you can pass those typed outputs to new steps.

---

## 3. Deepening Type Inference as the Flow Grows

Each time you create a new step:

```ts
.step<
  Slug extends string,
  Deps extends Extract<keyof Steps, string> = never,
  RetType extends Json = Json,
  Payload = { run: RunPayload } & { [K in Deps]: Steps[K] }
>(
  opts: { slug: Slug; dependsOn?: Deps[] } & RuntimeOptions,
  handler: (payload: Payload) => RetType | Promise<RetType>
)
```

- The new `Steps` type is computed as:
  ```ts
  type NewSteps = MergeObjects<Steps, { [K in Slug]: Awaited<RetType> }>;
  ```
- Then you instantiate a brand-new `Flow<RunPayload, NewSteps>`, effectively “tagging on” the new step’s output type for all future users.

It’s this chain of returning a new `Flow<..., NewSteps>` that yields strong typing of dependencies in subsequent steps.

---

## 4. Caveats / Limitations

1. **Circular dependencies**. By design, it must be an acyclic flow or you’ll have conflicting types (and probably logic issues).
2. **Complex inference**. As the `Steps` type grows, the type checker can start to slow down if you have a very large number of steps, especially because merges can become more complex.
3. **Excess property checks vs. partial merges**. If you have partial merges or optional steps, you might need to refine your merge logic (e.g., steps that only conditionally produce values). You can still do that with conditional types, but it increases complexity.

---

## 5. Final Verdict

Yes, you can create a DSL that strongly types each step’s input based on prior steps’ outputs. In fact, your example code is very close to a common TypeScript “sequential builder” pattern and is a perfectly valid approach. You’ve already nailed most of the advanced type-hopping techniques needed (e.g., returning a brand-new generic `Flow` each time to accumulate the typed steps).

If you’re comfortable with how your example is organized and the performance is adequate, you already have all the scaffolding you need to continue extending it.