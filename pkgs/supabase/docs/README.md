# pgflow: Getting Started with Supabase

pgflow is a PostgreSQL-centric workflow engine designed for seamless integration with Supabase. It allows you to define, execute, and manage complex workflows directly within your database, leveraging Supabase's powerful features.

## Features

- **Database-Native Workflows**: Define workflows using SQL within PostgreSQL.
- **Asynchronous Execution**: Integrate with task queues for non-blocking operations.
- **Dependency Management**: Handle complex step dependencies with ease.
- **Supabase Integration**: Optimized for Supabase projects.
- **Extensible Schema**: Customize and extend as per your application's needs.

## Prerequisites

- PostgreSQL 12 or higher
- Supabase project
- Node.js and npm

## Installation

### Step 1: Install pgflow

Use the following command to install pgflow and set up the necessary database schema:

```bash
npx pgflow install
```

This command will create the required tables and functions in your PostgreSQL database.

### Step 2: Define Your Workflow

Create a new workflow using the `Flow` class in your application code. Here's an example:

```typescript
import { Flow } from 'pgflow';

type RunPayload = {
  objectId: string;
  objectName: string;
  bucketId: string;
  ownerId: string;
};

const flow = new Flow<RunPayload>()
  .addRootStep("transcribe", async ({ objectName, bucketId }) => {
    // Transcription logic
    return { transcription: "Sample transcription" };
  })
  .addStep("summarize", ["transcribe"], async ({ transcribe }) => {
    // Summarization logic
    return { summary: "Sample summary" };
  })
  .addStep("capitalize", ["transcribe"], ({ transcribe }) => {
    return transcribe.transcription.toUpperCase();
  })
  .addStep("merge", ["summarize", "capitalize"], (payload) => {
    return JSON.stringify(payload);
  });
```

### Step 3: Generate SQL Statements

Use the `pgflow generate` command to convert your workflow definition into SQL statements:

```bash
npx pgflow generate --file path/to/your/flow.ts
```

This command will output the necessary SQL `INSERT` statements to create the flows, steps, and dependencies in your database.

### Step 4: Run the Workflow

Start a workflow execution with an initial payload:

```typescript
import { runFlow } from 'pgflow';

const payload = {
  objectId: "123",
  objectName: "audio.mp3",
  bucketId: "bucket1",
  ownerId: "owner123"
};

runFlow('your_flow_slug', payload);
```

## Example

Here's a complete example of defining and running a workflow:

```typescript
import { Flow, runFlow } from 'pgflow';

type RunPayload = {
  objectId: string;
  objectName: string;
  bucketId: string;
  ownerId: string;
};

const flow = new Flow<RunPayload>()
  .addRootStep("transcribe", async ({ objectName, bucketId }) => {
    // Transcription logic
    return { transcription: "Sample transcription" };
  })
  .addStep("summarize", ["transcribe"], async ({ transcribe }) => {
    // Summarization logic
    return { summary: "Sample summary" };
  })
  .addStep("capitalize", ["transcribe"], ({ transcribe }) => {
    return transcribe.transcription.toUpperCase();
  })
  .addStep("merge", ["summarize", "capitalize"], (payload) => {
    return JSON.stringify(payload);
  });

// Generate SQL statements
npx pgflow generate --file path/to/your/flow.ts

// Run the workflow
const payload = {
  objectId: "123",
  objectName: "audio.mp3",
  bucketId: "bucket1",
  ownerId: "owner123"
};

runFlow('your_flow_slug', payload);
```

## Conclusion

pgflow provides a powerful and flexible way to manage workflows within your Supabase application. By leveraging PostgreSQL's capabilities and Supabase's integration, you can build complex workflows with ease. Use the `Flow` class to define your workflows and the `pgflow` CLI to manage them efficiently.
