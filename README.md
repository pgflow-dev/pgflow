# pgflow

### Where complex becomes clockwork.

> "Things just happen. What the hell. And the reason things just happen is that a hundred billion other things just happened, all working unheeded and unseen, to make sure that they do."
>
> –- Terry Pratchett, Last Continent<br> > &nbsp;&nbsp;&nbsp; reflecting on the elegant machinery of complex systems

---

## Overview

pgflow is a workflow orchestration system that runs directly in your Postgres database—ideal for building reliable AI workflows, background jobs, and data pipelines on Supabase without external services.

The system combines:

- **SQL Core** - Workflow state management natively in Postgres with ACID compliance
- **TypeScript DSL** - Type-safe workflow definitions with automatic inference
- **Edge Worker** - Auto-respawning task processor that handles retries and concurrency
- **CLI Tools** - One-command setup with automatic schema migrations

## Documentation

The pgflow documentation is [available on pgflow.dev](https://pgflow.dev).

## Getting help

File an issue on [GitHub](https://github.com/pgflow-dev/pgflow/issues/new) or join our [Discord](https://discord.gg/NpffdEyb).

## Why pgflow?

When you need more than just isolated background jobs, but don't want the complexity of external orchestration systems:

- **Postgres as the Single Source of Truth** - All definitions, state, and history in your database
- **Zero Infrastructure** - No external services, dashboards, or control planes
- **Type-Safe Workflows** - Full compile-time safety between workflow steps
- **Reliable Background Jobs** - Automatic retries with backoff and observability

## What can you build?

- **AI Workflows** - Chain LLMs, scrape data, reason across tools, and handle failures
- **Background Jobs** - Process emails, files, and scheduled tasks with full visibility
- **Data Pipelines** - Extract, transform, and load data with built-in dependency handling

## Type-safe DAG workflow example

```typescript
new Flow<{ url: string }>({
  slug: 'analyze_website',
})
  .step(
    { slug: 'website' },
    async (input) => await scrapeWebsite(input.run.url)
  )
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    async (input) => await summarizeWithAI(input.website.content)
  )
  .step(
    { slug: 'tags', dependsOn: ['website'] },
    async (input) => await extractTags(input.website.content)
  )
  .step(
    { slug: 'saveToDb', dependsOn: ['summary', 'tags'] },
    async ({ run, summary, tags }) =>
      await saveWebsite({
        url: run.url,
        summary,
        tags,
      })
  );
```

## How pgflow works

1. **Define workflows using TypeScript DSL**
2. **Compile them to SQL migrations**
3. **Deploy as Supabase Edge Functions**
4. **Trigger workflows from your app or SQL**

The execution system handles the rest—scheduling steps when dependencies complete, retrying failed tasks, and aggregating results automatically.

## Packages

| Package                                | Description                                                             |
| -------------------------------------- | ----------------------------------------------------------------------- |
| [cli](./pkgs/cli/)                     | Command-line interface for installing and compiling flows               |
| [core](./pkgs/core/)                   | SQL Core for the workflow engine - foundational tables and functions    |
| [dsl](./pkgs/dsl/)                     | TypeScript DSL for defining flows with type inference                   |
| [edge-worker](./pkgs/edge-worker/)     | Task queue worker for Supabase Edge Functions with reliability features |
| [website](./pkgs/website/)             | Documentation site                                                      |
| [example-flows](./pkgs/example-flows/) | Example workflow definitions                                            |

## Resources

- 📖 **Documentation**: [pgflow.dev](https://pgflow.dev)
- 🚀 **Demo**: [pgflow-demo.netlify.app](https://pgflow-demo.netlify.app)
- 🛠️ **Getting Started**: [pgflow.dev/getting-started](https://pgflow.dev/getting-started)

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.
