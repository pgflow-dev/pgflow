---
"@pgflow/core": patch
---

Mark unfinished tasks as cancelled when their run fails, prevent late callbacks and stalled recovery from reviving them, and repair active tasks on historical failed runs.
