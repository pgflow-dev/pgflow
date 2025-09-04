---
'@pgflow/edge-worker': patch
---

Add workerConfig to handler execution context

Handlers can now access worker configuration through `context.workerConfig` to make intelligent decisions based on retry limits, concurrency settings, and other worker parameters. The config is deeply frozen to prevent accidental modifications while remaining mutable by the worker itself for future features.

Key improvements:
- Added `workerConfig` to MessageExecution and StepTaskExecution contexts
- Config is cached and frozen once at startup for optimal performance
- Reorganized configuration handling with cleaner factory methods
- Simplified EdgeWorker API by removing unnecessary union types
- Environment variables always sourced from platform (users cannot override)
