---
'pgflow': patch
'@pgflow/client': patch
'@pgflow/core': patch
'@pgflow/edge-worker': patch
'@pgflow/website': patch
---

Fix incorrect Supabase CLI version requirement from 2.34.3 to 2.50.3. CLI 2.50.3 is the first version to include pgmq 1.5.0+, which is required for pgflow 0.8.0+.
