# @pgflow/dsl

The TypeScript Domain Specific Language (DSL) for defining type-safe workflow definitions in pgflow.

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.

## Overview

`@pgflow/dsl` provides a type-safe, fluent interface for defining data-driven workflows with explicit dependencies. The DSL ensures that data flows correctly between steps and maintains type safety throughout the entire workflow definition.

Key features:

- **Type Safety** - Complete TypeScript type checking from flow inputs to outputs
- **Fluent Interface** - Chainable method calls for defining steps and dependencies
- **Functional Approach** - Clean separation between task implementation and flow orchestration
- **JSON-Compatible** - All inputs and outputs are JSON-serializable for database storage
- **Immutable Flow Definitions** - Each step operation returns a new Flow instance

## Usage

### Basic Example

```typescript
import { Flow } from '@pgflow/dsl';

// Define input type for the flow
type Input = {
  url: string;
};

// Define a flow with steps and dependencies
export const AnalyzeWebsite = new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 3,
  baseDelay: 5,
  timeout: 10,
})
  .step(
    { slug: 'website' },
    async (input) => await scrapeWebsite(input.run.url)
  )
  .step(
    { slug: 'sentiment', dependsOn: ['website'] },
    async (input) => await analyzeSentiment(input.website.content)
  )
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    async (input) => await summarizeWithAI(input.website.content)
  )
  .step(
    { slug: 'saveToDb', dependsOn: ['sentiment', 'summary'] },
    async (input) => {
      return await saveToDb({
        websiteUrl: input.run.url,
        sentiment: input.sentiment.score,
        summary: input.summary.aiSummary,
      });
    }
  );
```

### Understanding Data Flow

In pgflow, each step receives an `input` object that contains:

1. **`input.run`** - The original flow input (available to all steps)
2. **`input.{stepName}`** - Outputs from dependency steps

This design ensures:

- Original flow parameters are accessible throughout the entire flow
- Data doesn't need to be manually forwarded through intermediate steps
- Steps can combine original input with processed data from previous steps

### Step Methods

The Flow DSL provides three methods for defining steps in your workflow:

#### `.step()` - Regular Steps

The standard method for adding steps to a flow. Each step processes input and returns output.

```typescript
.step(
  { slug: 'process', dependsOn: ['previous'] },
  async (input) => {
    // Access input.run and input.previous
    return { result: 'processed' };
  }
)
```

#### `.array()` - Array-Returning Steps

A semantic wrapper around `.step()` that provides type enforcement for steps that return arrays. Useful for data fetching or collection steps.

```typescript
.array(
  { slug: 'fetch_items' },
  async () => [1, 2, 3, 4, 5]
)
```

#### `.map()` - Array Processing Steps

Processes arrays element-by-element, similar to JavaScript's `Array.map()`. The handler receives individual items instead of the full input object.

```typescript
// Root map - processes flow input array
new Flow<string[]>({ slug: 'process_strings' })
  .map({ slug: 'uppercase' }, (item) => item.toUpperCase());

// Dependent map - processes another step's output
new Flow<{}>({ slug: 'data_pipeline' })
  .array({ slug: 'numbers' }, () => [1, 2, 3])
  .map({ slug: 'double', array: 'numbers' }, (n) => n * 2)
  .map({ slug: 'square', array: 'double' }, (n) => n * n);
```

**Key differences from regular steps:**
- Uses `array:` instead of `dependsOn:` for specifying the single array dependency
- Handler signature is `(item, context) => result` instead of `(input, context) => result`
- Return type is always an array
- Generates SQL with `step_type => 'map'` parameter for pgflow's map processing

**Type Safety:**
The `.map()` method provides full TypeScript type inference for array elements:

```typescript
type User = { id: number; name: string };

new Flow<{}>({ slug: 'user_flow' })
  .array({ slug: 'users' }, (): User[] => [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ])
  .map({ slug: 'greet', array: 'users' }, (user) => {
    // TypeScript knows user is of type User
    return `Hello, ${user.name} (ID: ${user.id})`;
  });
```

**Limitations:**
- Can only depend on a single array-returning step
- TypeScript may not track type transformations between chained maps (use type assertions if needed)

### Context Object

Step handlers can optionally receive a second parameter - the **context object** - which provides access to platform resources and runtime information.

```typescript
.step(
  { slug: 'saveToDb' },
  async (input, context) => {
    // Access platform resources through context
    const result = await context.sql`SELECT * FROM users WHERE id = ${input.userId}`;
    return result[0];
  }
)
```

#### Core Context Resources

All platforms provide these core resources:

- **`context.env`** - Environment variables (`Record<string, string | undefined>`)
- **`context.shutdownSignal`** - AbortSignal for graceful shutdown handling
- **`context.rawMessage`** - Original pgmq message with metadata
  ```typescript
  interface PgmqMessageRecord<T> {
    msg_id: number;
    read_ct: number;
    enqueued_at: Date;
    vt: Date;
    message: T; // <-- this is your 'input'
  }
  ```
- **`context.stepTask`** - Current step task details (flow handlers only)
  ```typescript
  interface StepTaskRecord<TFlow> {
    flow_slug: string;
    run_id: string;
    step_slug: string;
    input: StepInput<TFlow, StepSlug>; // <-- this is handler 'input'
    msg_id: number;
  }
  ```
- **`context.workerConfig`** - Resolved worker configuration with all defaults applied
  ```typescript
  // Provides access to worker settings like retry limits
  const isLastAttempt = context.rawMessage.read_ct >= context.workerConfig.retry.limit;
  ```

#### Supabase Platform Resources

When using the Supabase platform with EdgeWorker, additional resources are available:

- **`context.sql`** - PostgreSQL client (postgres.js)
- **`context.supabase`** - Supabase client with service role key for full database access

To use Supabase resources, import the `Flow` class from the Supabase preset:

```typescript
import { Flow } from '@pgflow/dsl/supabase';

const MyFlow = new Flow<{ userId: string }>({
  slug: 'my_flow',
}).step({ slug: 'process' }, async (input, context) => {
  // TypeScript knows context includes Supabase resources
  const { data } = await context.supabase
    .from('users')
    .select('*')
    .eq('id', input.userId);

  // Use SQL directly
  const stats = await context.sql`
      SELECT COUNT(*) as total FROM events 
      WHERE user_id = ${input.userId}
    `;

  return { user: data[0], eventCount: stats[0].total };
});
```

> [!NOTE]
> Context is optional - handlers that don't need platform resources can omit the second parameter for backward compatibility.

For more details on available resources and platform configuration, see the [@pgflow/edge-worker documentation](https://github.com/pgflow-org/pgflow/tree/main/pkgs/edge-worker#context-resources).

### Flow Configuration

Configure flows and steps with runtime options:

```typescript
new Flow<Input>({
  slug: 'my_flow', // Required: Unique flow identifier
  maxAttempts: 3, // Optional: Maximum retry attempts (default: 1)
  baseDelay: 5, // Optional: Base delay in seconds for retries (default: 1)
  timeout: 10, // Optional: Task timeout in seconds (default: 30)
});
```

## Compiling Flows

Use the `compileFlow` utility to convert a flow definition into SQL statements:

```typescript
import { compileFlow } from '@pgflow/dsl';

const sqlStatements = compileFlow(MyFlow);
console.log(sqlStatements.join('\n'));
```

Alternatively, use the pgflow CLI to compile flows directly to migration files:

```bash
npx pgflow compile path/to/flow.ts
```

## Requirements

- All step inputs and outputs MUST be JSON-serializable
- Use only: primitive types, plain objects, and arrays
- Convert dates to ISO strings (`new Date().toISOString()`)
- Avoid: class instances, functions, symbols, undefined values, and circular references

## Building

Run `nx build dsl` to build the library.

## Running unit tests

Run `nx test dsl` to execute the unit tests via [Vitest](https://vitest.dev/).

## Documentation

For detailed documentation on the Flow DSL, visit:

- [Understanding the Flow DSL](https://pgflow.dev/explanations/flow-dsl/)
