---
title: Troubleshooting
draft: true
prev:
  link: /edge-worker/monitoring
  label: Monitoring
next:
  link: /edge-worker/ideas
  label: Ideas
---

This page serves as a place to document common issues and their solutions.

## Worker stopped processing messages

This is the main issue with current implementation and I believe it is due
to abruptly terminated SQL connections - we use Session Mode after all,
so any abruptly-closed connection will rely on pooler's `idle_timeout`
to close it. If the timeout is too big it can lead to the depletion
of the pool - Workers will create more connections than will be reclained.

```
[Error] Timeout-triggered archive failed: PostgresError: DbHandler exited
    at ErrorResponse (https://deno.land/x/postgresjs@v3.4.5/src/connection.js:791:26)
    at handle (https://deno.land/x/postgresjs@v3.4.5/src/connection.js:477:6)
    at data (https://deno.land/x/postgresjs@v3.4.5/src/connection.js:318:9)
    at https://deno.land/x/postgresjs@v3.4.5/polyfills.js:138:30
    at Array.forEach (<anonymous>)
    at call (https://deno.land/x/postgresjs@v3.4.5/polyfills.js:138:16)
    at success (https://deno.land/x/postgresjs@v3.4.5/polyfills.js:98:9)
    at eventLoopTick (ext:core/01_core.js:168:7) {
  name: "PostgresError",
  severity_local: "FATAL",
  severity: "FATAL",
  code: "XX000"
}
```
