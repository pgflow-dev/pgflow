# pgflow.dev documentation website

This is documentation website for **pgflow** stack, hosted at [pgflow.dev](https://pgflow.dev).

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.

> [!TIP]
> For technical information about the Astro setup, see [ASTRO_README.md](./ASTRO_README.md).

## Documentation Structure

PgFlow's documentation follows the [Diátaxis framework](https://diataxis.fr/), which organizes technical documentation into four distinct types, each serving a specific user need:

1. **Tutorials** - Learning-oriented content: _"How do I get started with PgFlow?"_
2. **How-to Guides** - Problem-oriented content: _"How do I deploy my flow to production?"_
3. **Explanations** - Understanding-oriented content: _"How does PgFlow's retry mechanism work?"_
4. **References** - Information-oriented content: _"What options are available for flow configuration?"_

When adding new documentation, consider which question the content answers:
- If it helps someone **learn by doing** → It's a Tutorial
- If it helps someone **solve a specific problem** → It's a How-to Guide
- If it helps someone **understand a concept** → It's an Explanation
- If it provides **precise technical information** → It's a Reference

## Documentation Sections

Our documentation is organized into the following sections that align with the Diátaxis framework:

### 🟢 `START HERE` (Tutorials – Learning-oriented)

> Guides new users through accomplishing their first successful outcome.

This section includes step-by-step tutorials like:
- Getting Started
- Install pgflow
- Create your first flow
- Compile flow to SQL
- Run your Flow

### 🔵 `CONCEPTS` (Conceptual – Mental models)

> Explains the underlying ideas and paradigms of pgflow.

This section helps users build mental models about:
- Overview (What is pgflow?)
- Understanding the Flow DSL
- Flow vs Task thinking
- Data dependencies and DAGs

### 🟠 `HOW IT WORKS` (Explanation – System internals)

> Explains how pgflow functions under the hood, its architecture, and execution model.

This section covers technical explanations like:
- Architecture Overview
- Step Execution Lifecycle
- SQL Compilation & Migration
- Supabase Edge Integration
- Retry & Concurrency Model

### 🔵 `COMPARISONS` (Conceptual – Evaluative understanding)

> Helps users conceptually compare pgflow to alternatives. Supports decision-making.

This section compares pgflow to other workflow engines:
- Comparison to DBOS
- Comparison to Trigger.dev
- Comparison to Inngest

### 🟢 `HOW TO` (Tutorials – Procedural guides)

> Step-by-step instructions for specific tasks or configurations.

This section provides guides for common tasks:
- Monitor flow execution
- Organize Flows code
- Create Reusable Tasks
- Update Flow Options
- Version your flows
- Deploy to Supabase.com

### 🔴 `REFERENCE` (Reference – Precise information)

> Canonical reference material with no explanation—just facts and specs.

This section includes technical references:
- SQL Schema (internal tables, views, triggers)
- Flow Definition API (DSL reference)
- Environment Variables & Config Options

## Key Documentation Principles

When contributing to PgFlow documentation, keep these principles in mind:

1. **Postgres-first mindset** - All explanations should emphasize the database-centric nature
2. **Three-layer clarity** - Clear separation of DSL, SQL Core, and Edge Worker concepts
3. **Progressive disclosure** - Start with simple concepts before introducing advanced topics
4. **Code examples** - Demonstrate real-world usage aligned with design philosophy
5. **Cross-reference related content** - Link between tutorials, how-tos, explanations, and references

For more detailed information about our documentation approach, see [DIATAXIS.md](../../DIATAXIS.md).