# Documentation Structure Using Diátaxis

The [Diátaxis framework](https://diataxis.fr/) provides a systematic approach to technical documentation by recognizing four distinct types of documentation, each serving a specific user need:

1. **Tutorials** - Learning-oriented content
2. **How-to Guides** - Problem-oriented content
3. **Explanations** - Understanding-oriented content
4. **References** - Information-oriented content

## Applying Diátaxis to PgFlow Documentation

PgFlow's documentation can be naturally structured following Diátaxis principles while preserving its unique character and development philosophy.

### Tutorials (Learning-oriented)

Tutorials help new users get started through hands-on experience:

- **Getting Started with PgFlow**
  - First-time setup with Supabase
  - Creating your first workflow with the TypeScript DSL
  - Deploying Edge Workers
  - Running and monitoring your first flow

- **Building Common Workflow Patterns**
  - Sequential processing
  - Parallel tasks
  - Error handling and retry patterns
  - Data transformation chains

Tutorials should be:
- Goal-oriented with clear outcomes
- Focused on practical experience rather than explanation
- Structured as step-by-step instructions
- Designed for beginners who are learning by doing

### How-to Guides (Problem-oriented)

How-to guides address specific tasks for users who know what they need to accomplish:

- **Working with PgFlow**
  - How to deploy to Supabase.com
  - How to implement custom retry logic
  - How to configure worker concurrency
  - How to monitor flow execution

- **Troubleshooting**
  - Resolving common worker issues
  - Debugging failed flows
  - Performance optimization
  - Migration strategies

How-to guides should be:
- Focused on practical steps to solve specific problems
- Directed toward a clear goal
- Minimal in explanation (just enough context)
- Easily scannable for experienced users

### Explanations (Understanding-oriented)

Explanations provide background and context to help users understand PgFlow's concepts:

- **Core Concepts**
  - The three-layer architecture (DSL, SQL Core, Edge Worker)
  - Postgres-first philosophy
  - Flow execution lifecycle
  - State management and consistency model

- **Design Decisions**
  - Why DAG-only workflows
  - JSON serialization approach
  - At-least-once delivery with pgmq
  - Immutable definitions

Explanations should be:
- Clear about the "why" behind design decisions
- Connected to PgFlow's design philosophy
- Focused on concepts rather than specific code
- Providing deeper understanding beyond task completion

### References (Information-oriented)

References provide precise, comprehensive technical information:

- **API Documentation**
  - TypeScript DSL API
  - SQL Core functions
  - Edge Worker configuration
  - CLI commands

- **Schema & Configuration**
  - Database schema reference
  - Configuration options for flows and steps
  - Environment variables
  - Supabase configuration

References should be:
- Comprehensive and accurate
- Structured consistently
- Minimal in explanatory content
- Optimized for quick information lookup

## Document Organization

Following are some suggestions for organizing the documentation within the existing structure:

1. **Website Package (`pkgs/website`)**
   - Main documentation hub organized by the four Diátaxis categories
   - Clear navigation between related content

2. **README Files**
   - Each package README should focus on quick setup (how-to) and links to more comprehensive docs
   - Root README should provide a project overview and guide to documentation

3. **API Documentation**
   - Generated from code comments where appropriate
   - Reference-style content that's comprehensive and accurate

## Key Principles for PgFlow Documentation

While applying Diátaxis, PgFlow documentation should maintain:

1. **Postgres-first mindset** - All explanations should emphasize the database-centric nature
2. **Three-layer clarity** - Clear separation of DSL, SQL Core, and Edge Worker concepts
3. **Progressive disclosure** - Start with simple concepts before introducing advanced topics
4. **Code examples** - Demonstrate real-world usage aligned with design philosophy
5. **Cross-reference related content** - Link between tutorials, how-tos, explanations, and references

By structuring documentation this way, users will be able to find what they need whether they're learning for the first time, solving a specific problem, seeking deeper understanding, or looking up precise technical details.