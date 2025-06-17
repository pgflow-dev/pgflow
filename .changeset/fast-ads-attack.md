---
'@pgflow/client': minor
'@pgflow/core': minor
'@pgflow/edge-worker': patch
'@pgflow/dsl': patch
---

Add TypeScript client library for pgflow workflow management

## @pgflow/client

Introduces a new TypeScript client library that provides both event-based and promise-based APIs for interacting with pgflow workflows:

### Features
- **Type-safe workflow management** with full TypeScript support and automatic type inference from flow definitions
- **Dual API approach**: Choose between event-based subscriptions or promise-based async/await patterns
- **Real-time monitoring** via Supabase broadcasts with granular event subscriptions
- **Resource management** with automatic cleanup and disposal
- **Comprehensive error handling** and recovery mechanisms

### Core Components
- `PgflowClient` - Main client for starting and managing workflow runs
- `FlowRun` - Monitor and interact with workflow executions
- `FlowStep` - Track individual step progress and outputs

### Example Usage
```typescript
// Start a workflow
const pgflow = new PgflowClient(supabase);
const run = await pgflow.startFlow('analyze_website', { url: 'https://example.com' });

// Event-based monitoring
run.on('completed', (event) => {
  console.log('Workflow completed:', event.output);
});

// Promise-based monitoring
const completed = await run.waitForStatus(FlowRunStatus.Completed, {
  timeoutMs: 30000
});
```

## @pgflow/core

### Database Enhancements
- Add `start_flow_with_states()` function to start flows and return complete initial state
- Add `get_run_with_states()` function to retrieve runs with all step states efficiently
- Implement `SECURITY DEFINER` functions for secure API access
- Add real-time broadcast support for workflow state changes

## @pgflow/edge-worker

### Test Infrastructure Updates
- Update test database configuration to use standard PostgreSQL credentials
- Improve test helper functions for database transactions
- Update Docker Compose configuration for test environment

## @pgflow/dsl

### Build Configuration
- Add TypeScript references to tsconfig.spec.json for improved type checking in tests
