# pgflow Functions Directory Structure

This directory contains pgflow functions organized according to best practices for maintainability, reusability, and clarity.

## Key Components

### `_flows/` Directory

Contains flow definitions that compose tasks into directed acyclic graphs (DAGs):

- **analyze_website.ts** - Orchestrates website analysis by coordinating scraping, summarization, tagging, and saving tasks

Flows define:

- Execution order
- Parallelism opportunities
- Data dependencies between tasks
- Error handling and retry logic

### `_tasks/` Directory

Contains small, focused functions that each perform a single unit of work:

- **scrapeWebsite.ts** - Fetches content from a given URL
- **convertToCleanMarkdown.ts** - Converts HTML to clean Markdown format
- **summarizeWithAI.ts** - Uses AI to generate content summaries
- **extractTags.ts** - Extracts relevant tags from content using AI
- **saveWebsite.ts** - Persists website data to the database

Tasks are:

- Modular and reusable across different flows
- Testable in isolation
- Designed with clear inputs and outputs
- JSON-serializable (required by pgflow)

### Edge Function Workers

Each flow has a corresponding edge function worker that executes the flow logic. By convention, workers are numbered (e.g., `analyze_website_worker_0`, `analyze_website_worker_1`) to enable multiple concurrent workers for the same flow.

### Supporting Files

- **utils.ts** - Shared utilities for database connections and common operations
- **database-types.d.ts** - TypeScript type definitions generated from the database schema
- **deno.json** - Configuration for Deno runtime in Edge Functions
- **deno.lock** - Lock file ensuring consistent dependency versions

## Best Practices

1. **Task Design**: Keep tasks focused on a single responsibility
2. **Flow Organization**: Use descriptive names and group related logic
3. **Type Safety**: Leverage TypeScript for flow inputs/outputs
4. **Error Handling**: Configure appropriate retries and timeouts
5. **JSON Serialization**: Ensure all data is JSON-serializable

For more details on organizing pgflow code, see the documentation at:
https://pgflow.io/how-to/organize-flows-code/
