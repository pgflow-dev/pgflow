# pgflow.dev documentation website

This is documentation website for **pgflow** stack, hosted at [pgflow.dev](https://pgflow.dev).

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.

> [!TIP]
> For technical information about the Astro setup, see [ASTRO_README.md](./ASTRO_README.md).

## Documentation Structure

pgflow's documentation follows the [Diátaxis framework](https://diataxis.fr/), which organizes technical documentation into four distinct types, each serving a specific user need:

1. **Tutorials** - Learning-oriented content: _"How do I get started with pgflow?"_
2. **How-to Guides** - Problem-oriented content: _"How do I deploy my flow to production?"_
3. **Explanations** - Understanding-oriented content: _"How does pgflow's retry mechanism work?"_
4. **References** - Information-oriented content: _"What options are available for flow configuration?"_

When adding new documentation, consider which question the content answers:
- If it helps someone **learn by doing** → It's a Tutorial
- If it helps someone **solve a specific problem** → It's a How-to Guide
- If it helps someone **understand a concept** → It's an Explanation
- If it provides **precise technical information** → It's a Reference

For detailed documentation structure, organized sections, and implementation guidelines, see:
- [CLAUDE.md](./CLAUDE.md) - Documentation organization details and guidance for contributors
- [DIATAXIS.md](../../DIATAXIS.md) - Full explanation of the Diátaxis framework as applied to pgflow