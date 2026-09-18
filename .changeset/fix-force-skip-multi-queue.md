---
'@pgflow/core': patch
---

Fix force-skip consuming only the first queue's archived messages when active tasks span multiple private step queues, and stop `assert_step_queue_available()` from reporting an owned route as available when its PGMQ queue is missing.
