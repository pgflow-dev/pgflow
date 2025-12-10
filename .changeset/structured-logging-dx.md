---
'@pgflow/edge-worker': patch
---

Major developer experience improvements with structured logging:

- Add verbose log level between info and debug for task outcomes
- Auto-detect local vs hosted environment for log format and level defaults
- Fancy formatter for local dev with colored icons, worker-prefixed lines, and flow/step paths
- Simple formatter for production with structured key=value output for log aggregators
- Display task duration, retry information with exponential backoff delay calculation
- Support NO_COLOR standard and EDGE_WORKER_LOG_LEVEL/EDGE_WORKER_LOG_FORMAT env vars
