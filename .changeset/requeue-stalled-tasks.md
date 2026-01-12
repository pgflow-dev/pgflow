---
'@pgflow/core': patch
'@pgflow/edge-worker': patch
---

Add automatic requeue for stalled tasks via cron job - tasks stuck beyond timeout+30s are requeued up to 3 times, then archived with status left as 'started' for easy identification (closes #586)
