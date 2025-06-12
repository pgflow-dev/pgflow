---
'@pgflow/core': patch
---

Optimize message visibility timeout updates with batch operations

- Added `pgflow.set_vt_batch()` function to update multiple message visibility timeouts in a single database call
- Replaced individual `pgmq.set_vt()` calls in `start_tasks()` with efficient batch updates
- Reduces database round-trips from N calls to 1 call when starting N tasks
- Improves performance and reduces database load during high-throughput task processing
