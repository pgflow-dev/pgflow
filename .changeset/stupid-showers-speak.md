---
'@pgflow/edge-worker': patch
---

Refine task logging levels for better visibility

- Move detailed execution logs from ExecutionController to MessageExecutor
- Demote controller-level logs from info to debug
- Promote task execution, retry, and error logs from debug to appropriate levels (info/error)
- Improve visibility of task lifecycle events and failures
