---
'@pgflow/edge-worker': patch
---

Add internal exports for experimental use

Expose internal components through a new `_internal` export path to enable experimentation with alternative worker architectures. These APIs are unstable and may change without notice. The internal exports are organized by namespace (core, platform, flow, queue) for better discoverability.

**⚠️ WARNING: These internal APIs are subject to change without notice. Import from `_internal` at your own risk!**
