---
"@pgflow/core": patch
"@pgflow/edge-worker": patch
---

Coordinate pending worker starts with invocation handshakes. `ensure_workers()` now reserves a unique `invocation_id` per function under a row lock and enqueues it in one transaction; the HTTP worker start atomically consumes the still-current, unexpired invocation when it registers readiness. Duplicate cron starts, duplicate delivery to independent runtimes, and manual/local requests now share one reservation protocol with a 60-second pending deadline, idempotent acknowledgement, explicit dismissal on failure, and bounded watchdog/SQL-timeout recovery. `debounce` becomes a retry throttle instead of the correctness mechanism. Includes the SQL migration and generated types; requires applying the migration before deploying new workers.
