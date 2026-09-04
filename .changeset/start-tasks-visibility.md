---
"@pgflow/core": patch
---

Make `start_tasks()` apply the PGMQ visibility extension before it returns claimed tasks. The visibility update is now structurally required (referenced CTE instead of an unreferenced `SELECT` CTE PostgreSQL may skip), so a claimed task keeps the effective timeout (`coalesce(step timeout, flow timeout) + 2`) instead of only the initial read visibility, and a visibility-update failure rolls back the whole claim.
