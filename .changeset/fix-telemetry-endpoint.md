---
"@pgflow/core": patch
"pgflow": patch
---

Fix the telemetry endpoint: send CLI install events and daily database reports to `https://telemetry.pgflow.dev` instead of the unresolvable `pgflow-telemetry.workers.dev` hostname. Existing 0.17.1 installations get the corrected `pgflow_telemetry.report()` function through a new additive migration; opted-out databases stay opted out. Patch-level behavior: opt-out flags, local/CI suppression, timeouts, and payload limits are unchanged.
