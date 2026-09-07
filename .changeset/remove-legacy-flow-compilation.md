---
'@pgflow/core': minor
'@pgflow/dsl': minor
'@pgflow/client': minor
'@pgflow/edge-worker': minor
'pgflow': minor
---

Remove migration-based flow compilation. Flow workers now always compile or verify their imported definition before registration and polling.

This removes `compileFlow()`, `compareFlowShapes()`, `ControlPlane`, `pgflow compile`, `FlowWorkerConfig.compilation`, and production `allowDataLoss`. The database migration removes `pgflow.ensure_flow_compiled(text, jsonb, boolean)`, so stop old workers before applying it and upgrade the fixed pgflow package set together.
