Here's the rewritten markdown document:

# Introducing **pgflow**

A Postgres-native workflow engine built specifically for Supabase projects.

## Overview

**pgflow** is a workflow engine that runs on top of Edge Functions and is orchestrated via Postgres functions. It is designed to be minimal, type-safe, and fully integrated with the Supabase ecosystem.

Key features:

- Native Postgres implementation with no additional infrastructure required
- Edge Functions for task execution
- Type-safe TypeScript DSL for workflow definitions
- Real-time monitoring via Supabase Realtime
- SQL-first design with RPC trigger support
- Built-in retries and error handling
- Support for complex parallel workflow patterns

## Core Components

### SQL Engine

The core of **pgflow** is implemented in pure SQL/PLpgSQL and consists of:

- Workflow state tracking tables
- Task scheduling and execution logic
- Dependency resolution system
- Real-time status updates via Realtime

```sql
-- Example: Triggering a workflow via SQL
SELECT pgflow.run_flow('MyFlow', '{"param": "value"}'::jsonb);
```

### TypeScript DSL

Workflows are defined using a type-safe DSL:

```typescript
const BasicFlow = new Flow<string>()
  .step("root", async ({ run }) => {
    return `Started: ${run}`;
  })
  .step("left", ["root"], async ({ root }) => {
    return `${root}/left`;
  })
  .step("right", ["root"], async ({ root }) => {
    return `${root}/right`;
  })
  .step("end", ["left", "right"], async ({ left, right }) => {
    return `Complete: ${left} and ${right}`;
  });
```

Key DSL features:

- Type inference for step inputs/outputs
- Compile-time dependency validation
- Support for parallel and sequential steps
- Built-in TypeScript type generation

### CLI Tools

The `pgflow` CLI provides:

- Project initialization and setup
- Flow compilation and deployment
- Status monitoring and debugging
- Migration management

```bash
# Initialize pgflow in a Supabase project
pgflow init

# Deploy a flow
pgflow deploy myflow
```

### SDK

A JavaScript/TypeScript SDK is available for running and monitoring flows:

```typescript
const flow = await client.flow("MyFlow").start({ param: "value" });

// Real-time status updates
flow.on("step:completed", (step) => {
  console.log(`Step ${step.slug} completed`);
});
```

## Current Status

The project is in late beta with:

- ✅ Core SQL engine complete and tested
- ✅ TypeScript DSL implementation
- ✅ Edge Functions worker
- ✅ Real-time monitoring
- ✅ Basic error handling and retries
- 🚧 CLI tools (in progress)
- 🚧 SDK refinements
- 🚧 Documentation

## Example Use Cases

- Multi-step document processing
- AI/ML pipelines
- ETL workflows
- Approval flows (soon!)
- Complex business processes
- Distributed data processing

## Next Steps

1. Complete CLI tooling
2. Expand documentation
3. Add testing utilities
4. Build monitoring dashboard
5. Implement workflow versioning

## Get Involved

The project is approaching public release. If you'd like to:

- Try the beta version
- Provide feedback
- Contribute to development
- Get updates on progress

Please leave a comment or reach out directly.
