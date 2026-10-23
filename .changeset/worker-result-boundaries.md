---
"@pgflow/core": patch
"@pgflow/edge-worker": patch
---

Preserve handler outcomes when worker logging or task settlement fails, and classify interruption from the worker shutdown signal instead of the exception name. Successful handlers get one completion attempt even during shutdown; settlement errors reach the worker error boundary without replay or conversion into handler failures.

Preserve falsy task outputs (`0`, `false`, and `""`) and store null or undefined outputs as JSON null instead of SQL NULL.
