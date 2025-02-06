---
title: Project Status
---

:::danger[Not ready for production!]

**Edge Worker** is currently in **Alpha** stage.

:::

:::note[API Stability]
The core `EdgeWorker.start()` API will remain stable. However, the configuration options structure
will be reorganized into logical sub-configurations. The current configuration shape should not be
considered stable and will change in future releases.
:::

This page is an overview of the issues that are observed but not yet resolved fully.

> I am actively working and communicating with Supabase Edge Runtime team to make
> the worker as robust as possible, so it can be a solid foundation
> for the Workflow Orchestration Engine I am building.

### Connection Pool Saturation Under High Load

**Scenario:**  
A large volume of messages is processed continuously at high concurrency (10 or more) with fast handlers (<50ms execution time).

**Observed Behavior:**  
  - Some connections are not properly closed by the worker before being hard-terminated
  - This results in zombie connections
  - The connection pooler should reclaim these connections after `client_idle_timeout`
  - However, if the worker respawns too quickly, the pooler cannot keep up
  - This can trigger **"Max client connections reached"** errors
  - These errors automatically resolve after zombie connections are reclaimed, but will reoccur if high load persists

**Impact:**  
Most users under normal operating conditions will not encounter this behavior.

**Next Steps:**  
An RFC for updates to Supabase Edge Runtime is in progress.

### Planned Architecture Improvements

Following the resolution of current issues, a major architectural refactor is planned.
The main goals are to:

#### Implement proper dependency injection

- Introduce a factory/builder pattern
- Enable easy component swapping, including:
  - MessageExecutor (required for pgflow orchestrator integration)
  - Polling mechanism (replacing ReadWithPollPoller with ListenNotifyPoller for improved performance)

#### Improve configuration handling

- Split the configuration into logical sub-configurations
- Add configuration validation
