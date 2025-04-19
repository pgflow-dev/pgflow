# Using the pgflow compile command

This document provides a quick guide on how to use the `pgflow compile` command to generate SQL migrations from your TypeScript flow definitions.

## Prerequisites

1. Install Deno: https://deno.land/manual/getting_started/installation
2. Set up a project with pgflow DSL

## Setup

1. Create a `deno.json` file in your project root with an import map:

```json
{
  "imports": {
    "@pgflow/dsl": "npm:@pgflow/dsl"
  }
}
```

2. Create a TypeScript file with a flow definition:

```typescript
// src/flows/analyze-website.ts
import { Flow } from '@pgflow/dsl';

// Define your flow
const AnalyzeWebsite = new Flow<{ url: string }>({
  slug: 'analyze_website',
  maxAttempts: 3,
  baseDelay: 5,
  timeout: 10,
})
  .step(
    { slug: 'website' },
    async (input) => {
      // Implementation
      return { content: `Content from ${input.run.url}` };
    }
  )
  .step(
    { slug: 'sentiment', dependsOn: ['website'] },
    async (input) => {
      // Implementation
      return { score: 0.8 };
    }
  );

// Export the flow as default
export default AnalyzeWebsite;
```

## Compile the flow

Run the compile command:

```bash
npx pgflow compile src/flows/analyze-website.ts --deno-json=deno.json
```

This will:
1. Create a `migrations` directory if it doesn't exist
2. Generate a SQL migration file with a timestamp, e.g., `migrations/pgflow_2025-04-19T13_45_30_123Z.sql`

## Apply the migration

You can apply the migration using your preferred database migration tool or directly with psql:

```bash
psql -h localhost -U postgres -d your_database -f migrations/pgflow_2025-04-19T13_45_30_123Z.sql
```

## Tips

- Make sure your flow file has a default export
- The flow must be a valid pgflow Flow object
- You can compile multiple flows by running the command multiple times with different flow files
- The generated SQL can be inspected and modified if needed before applying it to your database
