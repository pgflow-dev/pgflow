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
      const results = await saveToDb({
        websiteUrl: input.run.url,
        sentiment: input.sentiment.score,
        summary: input.summary.aiSummary,
      });
      return results.status;
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

### Flow Configuration

Configure flows and steps with runtime options:

```typescript
new Flow<Input>({
  slug: 'my_flow',     // Required: Unique flow identifier
  maxAttempts: 3,      // Optional: Maximum retry attempts (default: 3)
  baseDelay: 5,        // Optional: Base delay in seconds for retries (default: 1)
  timeout: 10,         // Optional: Task timeout in seconds (default: 30)
})
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