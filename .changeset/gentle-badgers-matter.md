---
'@pgflow/edge-worker': patch
---

Fix retry config validation to only enforce limit <= 50 for exponential strategy, allowing higher limits for fixed strategy
