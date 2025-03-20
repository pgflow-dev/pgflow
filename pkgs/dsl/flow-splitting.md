# Flow Composition and Reusability in TypeScript

Flow composition is a powerful pattern that can improve code organization, reusability, and maintainability. Let's explore ways to split up flow definitions, extract steps to separate files, and compose them in a clean, type-safe manner.

## Use Cases

Before diving into implementation, let's consider some realistic use cases where flow composition would be valuable:

1. **Common Database Operations**: Steps like `saveToDb`, `updateRecord`, or `fetchData` that are used across multiple flows
2. **Authentication Steps**: Common validation or authentication steps used in different flows
3. **Workflow Templates**: Industry-specific patterns like "analyze-then-report" or "fetch-transform-load"
4. **Step Grouping**: Grouping related steps like "data enrichment" or "notification" steps
5. **Testing**: Easily mock or replace specific parts of a flow for testing
6. **Domain Organization**: Keep domain-specific logic in separate files and directories

## Approaches to Flow Composition

### 1. Step Libraries

Create reusable step definitions in separate files that can be imported and added to flows.

**Example usage:**

```typescript
// flows/steps/database.ts
export const databaseSteps = {
  saveToDb: {
    options: { slug: 'saveToDb', timeout: 15 },
    handler: async (input: {
      websiteUrl: string;
      sentiment: number;
      summary: string;
    }) => {
      // Implementation
      return { status: 'success' };
    },
  },
};

// flows/analyze-website.ts
import { Flow } from '../new-flow';
import { databaseSteps } from './steps/database';

export const AnalyzeWebsite = new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 3,
})
  // Other steps...
  .step(
    { ...databaseSteps.saveToDb.options, dependsOn: ['sentiment', 'summary'] },
    async (input) => {
      return databaseSteps.saveToDb.handler({
        websiteUrl: input.run.url,
        sentiment: input.sentiment.score,
        summary: input.summary.aiSummary,
      });
    }
  );
```

### 2. Flow Extensions

A method to extend a flow with steps from another module.

**Example usage:**

```typescript
// flows/extensions/db-operations.ts
import { Flow } from '../new-flow';

export function addDatabaseOperations<
  T extends { url: string },
  S extends { sentiment: { score: number }; summary: { aiSummary: string } }
>(flow: Flow<T, S>) {
  return flow.step(
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
}

// flows/analyze-website.ts
import { Flow } from '../new-flow';
import { addDatabaseOperations } from './extensions/db-operations';

let flow = new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 3,
})
  // Add other steps...
  .step(
    { slug: 'sentiment', dependsOn: ['website'] },
    async (input) => await analyzeSentiment(input.website.content)
  )
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    async (input) => await summarizeWithAI(input.website.content)
  );

// Add database operations
export const AnalyzeWebsite = addDatabaseOperations(flow);
```

### 3. Flow Segments

Create segments of flows (multiple related steps) that can be combined.

**Example usage:**

```typescript
// flows/segments/data-processing.ts
import { Flow } from '../new-flow';

export function createDataProcessingSegment<
  T extends { url: string },
  S extends { website: { content: string } }
>(flow: Flow<T, S>) {
  return flow
    .step(
      { slug: 'sentiment', dependsOn: ['website'] },
      async (input) => await analyzeSentiment(input.website.content)
    )
    .step(
      { slug: 'summary', dependsOn: ['website'] },
      async (input) => await summarizeWithAI(input.website.content)
    );
}

// flows/analyze-website.ts
import { Flow } from '../new-flow';
import { createDataProcessingSegment } from './segments/data-processing';
import { addDatabaseOperations } from './extensions/db-operations';

let baseFlow = new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 3,
}).step(
  { slug: 'website' },
  async (input) => await scrapeWebsite(input.run.url)
);

// Add data processing segment
let processedFlow = createDataProcessingSegment(baseFlow);

// Add database operations
export const AnalyzeWebsite = addDatabaseOperations(processedFlow);
```

### 4. Flow Decorators

Use a decorator pattern to enhance flows with additional functionality.

**Example usage:**

```typescript
// flows/decorators/withDatabase.ts
import { Flow } from '../new-flow';

export function withDatabaseSave<
  T extends { url: string },
  S extends { sentiment: { score: number }; summary: { aiSummary: string } }
>(flow: Flow<T, S>) {
  return flow.step(
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
}

// flows/analyze-website.ts
import { Flow } from '../new-flow';
import { withDatabaseSave } from './decorators/withDatabase';

let flow = new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 3,
});
// Other steps...

// Add database save capability
export const AnalyzeWebsite = withDatabaseSave(flow);
```

### 5. Enhanced Flow API: `.include()` Method

Add a new method to the Flow class that allows including steps from external modules.

**Example usage:**

```typescript
// flows/steps/database.ts
export const saveToDbStep = {
  options: { slug: 'saveToDb' },
  handler: (input: any) => {
    // Implementation
    return { status: 'success' };
  },
  dependencies: ['sentiment', 'summary'],
  inputMapper: (input: any) => ({
    websiteUrl: input.run.url,
    sentiment: input.sentiment.score,
    summary: input.summary.aiSummary,
  }),
};

// flows/analyze-website.ts
import { Flow } from '../new-flow';
import { saveToDbStep } from './steps/database';

export const AnalyzeWebsite = new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 3,
})
  // Other steps...
  .include(saveToDbStep); // Include the external step
```
