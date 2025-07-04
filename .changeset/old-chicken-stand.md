---
'@pgflow/edge-worker': patch
---

Improve EdgeWorker debug logging and error handling

- Fix consistent usage of log severity levels (debug, info, error) across the worker
- Move non-essential logs to debug level to reduce noise in production
- Move execution results to appropriate info/error levels
- Fix log_level to properly default to 'info' instead of crashing on startup
- Update documentation URL that was returning 404
- Refactor getEnvVar to be properly typed with default value support
- Fix linting errors in retry-demo (remove unnecessary async, replace any with unknown)
