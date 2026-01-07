---
'@pgflow/edge-worker': patch
'@pgflow/core': patch
---

Note: Version 0.13.0 was yanked due to broken local environment detection. This release (0.13.1) includes both the fix and the features from 0.13.0.

- Fix local environment detection to use SUPABASE_URL instead of API keys
- Add step output storage optimization for 2x faster Map chains (outputs now stored in step_states.output instead of aggregated on-demand)
