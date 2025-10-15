# Documentation Structure (Diátaxis)

Uses [Diátaxis framework](https://diataxis.fr/) - four distinct documentation types:

1. **Tutorials** - Learning by doing (Getting Started, Common Patterns)
2. **How-to Guides** - Solving specific problems (Deployment, Troubleshooting)  
3. **Explanations** - Understanding concepts (Architecture, Design Decisions)
4. **References** - Technical specs (API docs, Schema, Configuration)

## pgflow-Specific Principles

- **Postgres-first mindset** - Database-centric explanations
- **Three-layer clarity** - DSL, SQL Core, Edge Worker separation
- **Progressive disclosure** - Simple → Advanced
- **Code examples** - Real-world usage
- **Cross-references** - Link related content

## Organization

- `pkgs/website` - Main docs hub by Diátaxis categories
- Package READMEs - Quick setup + links
- API docs - Generated from code comments