Here's my analysis and refinement of your ideas for new PgFlow DSL extensions, structured as a comprehensive markdown document:

# PgFlow DSL Extensions Proposal

## Overview

The proposal introduces several new extension methods for PgFlow DSL to enhance its functionality and provide more declarative ways of expressing common workflow patterns. These extensions would be implemented as higher-level abstractions that ultimately compile down to regular `.step()` calls.

## Core Concepts

### Extended Step Types

To support new step types, we'd need to:

1. Add a `step_type` column to `pgflow.steps` table
2. Optionally add a `task_type` column to `pgflow.step_tasks` table
3. Implement type-safe DSL methods that enforce correct usage patterns

## Proposed Extensions

### 1. Conditional Steps

```typescript
// Type-safe condition handler
type ConditionHandler<T> = (payload: T) => boolean | Promise<boolean>;

interface FlowExtensions<RunPayload> {
  conditional<Name extends string>(
    name: Name,
    condition: ConditionHandler<RunPayload>,
    handler: (payload: RunPayload) => Promise<void>,
  ): Flow<RunPayload>;
}

// Example Usage
const flow = new Flow<InputType>().conditional(
  "checkUserPermissions",
  async ({ user }) => user.hasPermission("ADMIN"),
  async (payload) => {
    // This handler runs only if condition is true
  },
);
```

**Implementation Details:**

- Adds two steps internally: condition check and handler
- Uses step metadata to control handler execution
- Leverages Postgres functions to evaluate condition results

### 2. Map/ForEach Operations

```typescript
interface FlowExtensions<RunPayload> {
  forEach<Name extends string, Item>(
    name: Name,
    items: (payload: RunPayload) => Item[],
    handler: (item: Item, index: number) => Promise<void>,
  ): Flow<RunPayload>;
}

// Example Usage
const flow = new Flow<{ items: string[] }>().forEach(
  "processItems",
  ({ items }) => items,
  async (item, index) => {
    // Process each item
  },
);
```

**Benefits:**

- Type-safe iteration over arrays
- Parallel processing capability
- Progress tracking per item

### 3. Supabase Integration

```typescript
interface SupabaseStepConfig<T> {
  // Type information for the RPC call
  type: T;
  // Optional configuration
  config?: {
    timeout?: number;
    retries?: number;
  };
}

interface FlowExtensions<RunPayload> {
  supabaseRpc<Name extends string, T>(
    name: Name,
    functionName: string,
    config: SupabaseStepConfig<T>,
    argsBuilder: (payload: RunPayload) => Record<string, unknown>,
  ): Flow<RunPayload>;
}

// Example Usage
const flow = new Flow<InputType>().supabaseRpc(
  "callFunction",
  "my_postgres_function",
  { type: z.object({ result: z.string() }) },
  ({ run }) => ({
    arg1: run.value,
    arg2: "static",
  }),
);
```

## Implementation Considerations

### 1. Type Safety

All extensions should maintain full type safety:

```typescript
// Type inference example
type StepResult = typeof flow.getSteps()["stepName"]["handler"] extends
  (...args: any[]) => Promise<infer R> ? R : never;
```

### 2. Error Handling

```typescript
interface ErrorConfig {
  retryStrategy?: "exponential" | "fixed";
  maxRetries?: number;
  onError?: (error: Error) => Promise<void>;
}

const flow = new Flow<InputType>().supabaseRpc("myStep", "function_name", {
  errorConfig: {
    retryStrategy: "exponential",
    maxRetries: 3,
    onError: async (error) => {
      // Custom error handling
    },
  },
});
```

### 3. Metadata Storage

```sql
ALTER TABLE pgflow.steps
ADD COLUMN step_type text,
ADD COLUMN step_config jsonb;

ALTER TABLE pgflow.step_tasks
ADD COLUMN task_type text,
ADD COLUMN task_config jsonb;
```

## Future Possibilities

1. **Timeout Handling**:

```typescript
.step("longRunning", {
  timeout: "1h",
  onTimeout: async () => {
    // Cleanup
  }
});
```

2. **Retry Policies**:

```typescript
.step("flaky", {
  retry: {
    maxAttempts: 3,
    backoff: "exponential",
    initialDelay: "1s"
  }
});
```

3. **Step Groups**:

```typescript
.group("dataProcessing", (group) =>
  group
    .step("extract")
    .step("transform")
    .step("load")
);
```

## References

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [PgFlow Core Documentation](https://github.com/your-repo/pgflow)

Would you like me to elaborate on any of these aspects or explore additional extension possibilities?
