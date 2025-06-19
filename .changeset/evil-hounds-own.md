---
'@pgflow/core': patch
---

Fix step:failed events not being broadcast when steps fail

Fixed a bug where step:failed events were not being broadcast to real-time subscribers when a step failed permanently. The issue was caused by PostgreSQL optimizing away the CTE that contained the realtime.send() call. The fix replaces the CTE approach with a direct PERFORM statement in the function body, ensuring the event is always sent when a step fails.
