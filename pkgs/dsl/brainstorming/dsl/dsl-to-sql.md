# Brainstorm: Converting a TypeScript Flow DSL into pgflow Definitions

This document explores various approaches for **translating a TypeScript Flow DSL** (effectively a typed object graph) directly into SQL statements that register flows in **pgflow** via `create_flow` and `add_step`. We also discuss how to manage these flows in development and production, respecting **immutable** flow definitions, versioning via `flow_slug`, and ensuring an **exceptional developer experience**. Finally, we’ll introduce some new ideas and best practices inspired by other tools.

## Why We Need a Flow DSL → SQL Compilation Step

1. **Single Source of Truth**: The TypeScript DSL is a more developer-friendly way to define flows (with auto-complete, type inference, etc.). However, pgflow requires the flow definition to be present in the database to manage steps, dependencies, and runs.
2. **Consistency**: We minimize manual steps (writing raw SQL) when we can automate it. This ensures that the flow structure in code stays in sync with what’s actually in the database.
3. **Safety & Auditing**: Flows are **immutable** in production to avoid “half-upgraded” scenarios. We need a reliable process for introducing new flows or updated flows (via new slugs) and ensuring old ones remain intact if they’re still used.

## Summary of Key Requirements

- Take the DSL object (with steps, dependencies, timeouts, etc.) and generate:
  - SQL queries calling `pgflow.create_flow(slug, ...)`
  - SQL queries for each step calling `pgflow.add_step(...)`, in topological order.
- Provide a **development** workflow that is fast to iterate on. Possibly auto-recreate the flow in the DB on every code change.
- Provide a **production** workflow that is safe and auditable. Possibly generate a migration script that can be run in CI/CD pipelines.
- If a flow with the same slug but different shape is encountered, we must throw an error (since flows are immutable and can’t be replaced in production).
- If we do re-register the same slug with the same shape, no updates are needed (safe no-op).
- Because flows are immutable, changes to shape require a new `flow_slug`.

## Potential Approaches

### 1. pgflow CLI Tool

A dedicated `pgflow` CLI could be responsible for:
- **“Deploying” a Flow**: 
  - Reads the TypeScript flow definitions (compiled or at runtime).
  - Converts them into SQL statements.
  - Executes the statements against the specified database (development environment).
- **“Compiling” a Flow**: 
  - Converts the TypeScript flow definition into raw SQL (or multiple .sql files).
  - Writes these files to a `migrations/` directory for deployment in production.
- **Version Checking**: 
  - If it detects the same `flow_slug` in the DB that differs from the code, it fails with a clear error (“Flow shape mismatch!”).
  - If it’s truly identical (no changes), it does nothing.
  - If it’s new, it proceeds to create the references.

#### Pros
- Straightforward user experience (just run `pgflow deploy` or `pgflow compile`).
- Clear separation of concerns: code → DSL → SQL → database.
- Allows ephemeral recreation in development or safer migrations in production.

#### Cons
- Might require additional tooling or configuration to integrate into existing build/deployment pipelines.
- Must maintain the DSL → SQL translator logic in the CLI.

### 2. Edge Worker Auto-Check & Registration

In this approach, the Edge Worker, upon startup or flow usage, does the following:
- Checks if the given `flow_slug` is already registered and if the shape matches. 
- If not, it attempts to create it (in development).
- If shape mismatch is found in production, it throws a fatal error to prevent usage.

#### Pros
- Zero extra steps for developers (the system just “does the right thing”).
- Minimizes friction or forgetting to deploy flows.

#### Cons
- Potentially tricky to manage safe versioning in production (accidental shape change could break the environment).
- Could lead to unexpected changes or overwritten flows if not carefully locked down.
- Harder to integrate with staging/production pipelines that require explicit migrations.

### 3. Hybrid Approach

Use a combination of CLI tooling and an Edge Worker check:

- **CLI** for local dev: 
  - `pgflow dev deploy --force` can recreate the flow on each code change, dropping existing definitions as needed. 
  - Acceptable in dev because losing run state is less critical.
- **CLI** for production migrations:
  - Instead of auto-executing, it writes `.sql` files that must be manually or automatically applied by a migration system. 
  - Reinforces the idea that “once in production, flows are immutable.”
- **Edge Worker**: 
  - Optionally can do a final shape check to confirm that dev or staging flows have been properly migrated. If a mismatch is found, throw an error to avoid partial updates.

This approach covers all bases: it’s frictionless in dev and strict in production.

## Immutable Flow Definitions & Versioning

Here’s a recap and deeper explanation of why flows are **immutable** in pgflow:

1. **Simplicity**: Maintaining multiple versions simultaneously might create confusion about which version is “official” or “latest.” 
2. **Safety**: Changing a flow mid-run can cause partial upgrades. By “freezing” them, you guarantee a stable environment for ongoing runs.
3. **Intentional Versioning**: If a flow’s shape changes, you create a new `flow_slug`. For example:
   - `analyze_website_v1` → initial version.
   - `analyze_website_v2` → new shape, separate definition.

While optional aliases to represent the “latest” version can be useful, we recommend making it an explicit user-land concept, not a built-in feature. This ensures that every environment references explicit version slugs.

## Development vs. Production Strategies

### Development (Auto-Update)

- **Auto-drop & recreate**: On every run, the system checks if the flow slug exists. If it does, drop the flow definition (and any partial run state) and recreate it fresh. 
  - Advantage: Instant reflection of code changes.
  - Disadvantage: You lose state from prior runs. But for dev, that’s often acceptable.
- **Alternative**: Use a randomness-based slug or incremental suffix in dev, so each new code iteration has a new slug (e.g., `flow_slug_dev_20231012_1`). This preserves old runs at the cost of clutter.

### Production (Migration & Strictness)

- **SQL Migration**: 
  - On code commit, run a command like `pgflow compile my_flow.ts --out migrations/2023-10-01_create_analyze_website.sql`. 
  - This file contains:
    ```sql
    SELECT pgflow.create_flow('analyze_website', ...);
    SELECT pgflow.add_step('analyze_website', 'website', ...);
    ...
    ```
  - Then your usual migration system applies this script once. If the slug already exists but definitions differ, the migration fails. Ops can step in to handle that.
- **No Migration**: If your flows are brand new with brand new slugs, you just add them. If you need to retire old flows, do so manually, or let them remain unchanged.

## Potential New Ideas

1. **Flow “Insight” Command**: 
   - A cli sub-command that prints a summary or “manifest” of the entire DSL — steps, dependencies, types, etc. 
   - Helps devs see the shape of the flow quickly or compare two versions at a glance.
2. **Checksum-based Upsert**: 
   - The CLI or Edge Worker could compute a content-based checksum of the DSL shape. If a flow with the same slug but a *different* checksum is in the DB, it refuses to proceed. If the checksums match, it’s a no-op. 
   - This ensures no accidental mismatch or partial updates.
3. **Local “Flow Playground”**: 
   - A local web interface that visually shows your flow’s DAG from the DSL, letting you step through nodes or edit them. 
   - Beneath the hood, it calls the same DSL → SQL logic for clarity.

## High-Level Example: CLI Flow

Below is a hypothetical example flow from code to deploy:

1. **Write a Flow** in TypeScript:

   ```ts
   const AnalyzeWebsite = new Flow<Input>({
     slug: "analyze_website_v2",
     ...
   })
     .step({ slug: "website" }, async (input) => { ... })
     .step({ slug: "sentiment", dependsOn: ["website"] }, async (input) => { ... })
     .step({ slug: "summary", dependsOn: ["website"] }, async (input) => { ... })
     .step({ slug: "saveToDb", dependsOn: ["sentiment", "summary"] }, async (input) => { ... });
   ```

2. **Compile**: Run:
   ```
   $ pgflow compile --file=flows/analyze_website_v2.ts --output=migrations/2023-10-01_analyze_website_v2.sql
   ```
   It generates SQL:
   ```sql
   SELECT pgflow.create_flow('analyze_website_v2', ...);
   SELECT pgflow.add_step('analyze_website_v2','website', ...);
   SELECT pgflow.add_step('analyze_website_v2','sentiment',..., deps => ARRAY['website']);
   SELECT pgflow.add_step('analyze_website_v2','summary',..., deps => ARRAY['website']);
   SELECT pgflow.add_step('analyze_website_v2','saveToDb',..., deps => ARRAY['sentiment','summary']);
   ```
3. **Deploy** in Development:
   ```
   $ pgflow deploy --dev migrations/2023-10-01_analyze_website_v2.sql
   ```
   - Optionally it can recreate the flow if it’s changed or new.
4. **Run** the same file in Production:
   - Typically through your standard migration pipeline (Alembic, Flyway, etc.).
   - If the flow slug is found and definitions mismatch, the migration fails, requiring manual action.

## Conclusion

The overarching goal is to create an **MVP** that is simple enough for everyday users but can scale to rigorous enterprise demands. By offering a **pgflow CLI** or an **auto-registration** approach, we can cater to different workflows:

- **Dev**: Fast, ephemeral registration, possibly auto-dropping old definitions. 
- **Prod**: Strict, immutability-enforced approach via migrations, with versioning handled through unique slugs.

### Key Takeaways

- **Immutable flows**: If the shape changes, you create a new slug (e.g., “flow_v2”). Older runs remain intact.
- **Choice of deployment**: 
  - *CLI-based* approach is explicit and suits mature pipelines. 
  - *Edge Worker* approach is more dynamic but risks environment mismatches if not carefully controlled.
- **Focus on exceptional DX**: Provide a streamlined developer experience with a one-liner to define, refine, and re-deploy flows, plus a frictionless path for production migration.
- **Stay flexible**: Expose simple primitives (DSL → SQL), so advanced teams can incorporate them into their own workflows, while new teams can rely on curated commands like `pgflow compile` or `pgflow deploy`.

With these foundations in place, **pgflow** can truly stand out as a robust, developer-friendly, and production-safe workflow orchestration framework built entirely in PostgreSQL.
