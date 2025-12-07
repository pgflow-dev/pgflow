---
'@pgflow/core': minor
'@pgflow/edge-worker': minor
---

Add automatic worker restart via `ensure_workers()` cron job that keeps edge functions running. Add `worker_functions` table for tracking registered edge functions and their health status. Add `stopped_at` column to workers table for graceful shutdown detection. Integrate `trackWorkerFunction` and `markWorkerStopped` into edge worker lifecycle for automatic registration and shutdown signaling.
