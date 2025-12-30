---
'@pgflow/core': minor
'@pgflow/dsl': minor
'@pgflow/client': minor
'@pgflow/edge-worker': minor
'pgflow': minor
---

BREAKING: Asymmetric handler signatures - remove `run` key from step inputs

- Root steps: `(flowInput, ctx) => ...` - flow input directly as first param
- Dependent steps: `(deps, ctx) => ...` - only dependency outputs as first param
- Access flow input in dependent steps via `ctx.flowInput`
- Enables functional composition and simplifies types for future subflows
