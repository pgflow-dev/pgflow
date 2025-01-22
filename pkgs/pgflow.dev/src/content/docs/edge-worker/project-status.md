---
title: ⚠️ Project Status
---

:::danger[Not ready for production!]

**Edge Worker** is currently in **Alpha Stage**.

:::

Edge Worker should be considered an advanced Proof of Concept.

It is **not production-ready** at this time.

I am actively working on resolving several known issues.

### PostgresError: DbHandler exited

When processing a high volume of jobs with increased concurrency (10 or more),
the system occasionally fails with the following error:

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

This issue appears to be related to abruptly terminated SQL connections in Session Mode.
When this error occurs, it prevents the system from spawning new instances.

### Postgres Deadlocks

In high-concurrency scenarios, we've observed occasional deadlocks. These occur due to
race conditions between message archiving and message pickup when visibility timeouts expire.

The planned solution involves implementing worker-side retries for SQL queries.

### Planned Architecture Improvements

Following the resolution of current issues, a major architectural refactor is planned. 
The main goals are to:

- Implement proper dependency injection
- Introduce a factory/builder pattern
- Enable easy component swapping, including:
  - MessageExecutor (required for pgflow orchestrator integration)
  - Polling mechanism (replacing ReadWithPollPoller with ListenNotifyPoller for improved performance)

:::note[API Stability]
The core `EdgeWorker.start()` API will remain stable. However, the configuration options structure 
will be reorganized into logical sub-configurations. The current configuration shape should not be 
considered stable and will change in future releases.
:::

