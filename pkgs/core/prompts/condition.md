# Conditional Steps in the Flow DSL

Conditional steps allow steps to run only when certain criteria are met based on the incoming payload. Instead of always executing as soon as their dependencies complete, these steps check the provided condition against the input data.

## How It Works

- **Definition**: A condition is supplied as a JSON fragment via the step options (for example, using `runIf` or `runUnless`).
- **Evaluation**: At runtime, the system evaluates the condition by comparing the step's combined inputs against the JSON fragment.
- **Mechanism**: Under the hood, the payload is matched against the condition using a JSON containment operator (`@>`), commonly available in PostgreSQL. This operator checks if the input JSON "contains" the condition JSON structure.
- **Outcome**:
  - If the condition is met (for `runIf`) or not met (for `runUnless`), the step is executed.
  - If the condition fails, the step is marked as skipped, and its downstream dependent steps are not executed (or are similarly marked as skipped).

This design helps ensure that unnecessary processing is avoided when prerequisites are not satisfied.

## Type safety

Options object can be strictly type-safe and only allow values that are available in the payload,
so it is impossible to define invalid condition object.

## Marking as skipped

Skipped steps are not considered a failure but will propagate skipped status to all dependent steps and
they will not run.

This way we can achieve a kinda robust low level branching logic - users can define branches
by creating steps with mutually-exclusive conditions, so only one branch will be executed:

```ts
const ScrapeWebsiteFlow = new Flow<{ input: true }>()
  .step('run_if_true', handler, { runIf: { run: { input: true } } })
  .step('run_if_false', handler, { runUnless: { run: { input: true } } })
```
