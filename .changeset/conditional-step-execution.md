---
'@pgflow/core': minor
'@pgflow/dsl': minor
---

Add conditional step execution with skip infrastructure

**New DSL Options:**

- `if` - Run step only when input contains specified pattern
- `ifNot` - Run step only when input does NOT contain pattern
- `whenUnmet` - Control behavior when condition not met (fail/skip/skip-cascade)
- `retriesExhausted` - Control behavior after all retries fail (fail/skip/skip-cascade)

**New Types:**

- `ContainmentPattern<T>` - Type-safe JSON containment patterns for conditions
- `StepMeta` - Track skippable dependencies for proper type inference

**Schema Changes:**

- New columns: required_input_pattern, forbidden_input_pattern, when_unmet, when_exhausted, skip_reason, skipped_at
- New step status: 'skipped'
- New function: cascade_skip_steps() for skip propagation
- FlowShape condition fields for auto-compilation drift detection
