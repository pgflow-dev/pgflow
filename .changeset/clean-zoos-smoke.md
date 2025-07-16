---
'@pgflow/edge-worker': patch
---

Remove PlatformAdapter from EdgeWorker.start() return type

The `EdgeWorker.start()` method now returns `Promise<void>` instead of `Promise<PlatformAdapter>`. The PlatformAdapter was never intended to be part of the public API and was accidentally exposed. This change properly encapsulates the internal implementation details.

**Breaking Change**: If you were using the returned PlatformAdapter (which was undocumented), you'll need to refactor your code. However, this is unlikely as the EdgeWorker is designed to be started and run without further interaction.
