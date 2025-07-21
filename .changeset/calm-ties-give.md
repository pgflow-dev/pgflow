---
'@pgflow/edge-worker': patch
'@pgflow/core': patch
---

Implement worker deprecation for graceful shutdowns

- Add deprecation support to enable zero-downtime deployments
- Workers now check deprecation status via heartbeat and stop accepting new work when deprecated
- Repurpose unused `stopped_at` column as `deprecated_at` for tracking deprecation timestamps
- Refactor heartbeat logic directly into lifecycle classes for improved type safety
- Add configurable heartbeat interval (default: 5 seconds)
- Workers complete in-flight work before shutting down when deprecated
