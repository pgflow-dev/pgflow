---
'@pgflow/core': patch
---

Improve failure handling and prevent orphaned messages in queue

- Archive all queued messages when a run fails to prevent resource waste
- Handle type constraint violations gracefully without exceptions
- Store output on failed tasks (including type violations) for debugging
- Add performance index for efficient message archiving
- Prevent retries on already-failed runs
- Update table constraint to allow output storage on failed tasks
