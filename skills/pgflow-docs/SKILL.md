---
name: pgflow-docs
description: Access current pgflow documentation on demand. Use when installing or updating pgflow, authoring or running flows, deploying or monitoring workers, debugging runs, using pgflow APIs or configuration, integrating with Supabase, or checking releases and project news.
---

# pgflow Documentation

Fetch current documentation from https://www.pgflow.dev instead of relying on
training data. Core docs define current behavior and APIs; news records what
shipped and when.

## Route to the matching section index

Fetch exactly one section index first:

| Task | Section index |
|------|---------------|
| Install, quickstart, first flow, background jobs, FAQ | https://www.pgflow.dev/docs-index/get-started.md |
| Author flows: steps, dependencies, conditions, retries, versioning | https://www.pgflow.dev/docs-index/build.md |
| Deploy and operate: Supabase/Node/Bun workers, monitoring, troubleshooting, updates | https://www.pgflow.dev/docs-index/deploy.md |
| How pgflow works: execution model, data model, compilation, architecture | https://www.pgflow.dev/docs-index/concepts.md |
| APIs and configuration: client, context, compile, permissions, settings | https://www.pgflow.dev/docs-index/reference.md |
| Hands-on tutorials: RAG, AI web scraper | https://www.pgflow.dev/docs-index/tutorials.md |
| Release announcements: what shipped and when | https://www.pgflow.dev/docs-index/news.md |
| pgflow vs other workflow engines | https://www.pgflow.dev/docs-index/comparisons.md |

Unsure which section fits? Start at https://www.pgflow.dev/docs-index.md.

## Workflow

1. Fetch the one section index matching the task.
2. Fetch only the linked pages the task needs — each entry names what the page
   covers; skip the rest.
3. Fetch another section index only when the task crosses sections or the
   first section leaves a gap.

## Completion criterion

Every pgflow-specific claim you rely on — API names, configuration options,
CLI commands, versions — is backed by a fetched documentation page, not by
memory. Anything not confirmed from a fetched page is unverified.
