---
'@pgflow/core': patch
'@pgflow/dsl': patch
'@pgflow/edge-worker': patch
---

Add automatic flow compilation at worker startup. Workers now call ensure_flow_compiled to verify flows are up-to-date. In development, mismatched flows are recompiled automatically. In production, mismatches cause errors. Use ensureCompiledOnStartup: false to opt-out.
