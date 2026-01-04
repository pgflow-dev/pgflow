---
'@pgflow/core': minor
---

Performance: Store step outputs atomically for 2x faster downstream task startup

Step outputs are now stored in step_states.output when steps complete, eliminating expensive aggregation queries. Benchmarks show 2.17x improvement for Map->Map chains. Includes data migration to backfill existing completed steps.
