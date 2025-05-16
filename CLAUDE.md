# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ PROJECT NAMING CONVENTION ⚠️

**IMPORTANT**: The name of the project should only ever be used as lowercase: **pgflow**

Never use:

- pgFlow
- PgFlow
- Pgflow
- PGFlow

The only exception is in class names, where "Pgflow" can be used (PascalCase).

## ⚠️ CHARACTER USAGE GUIDELINES ⚠️

**IMPORTANT**: Never use the following characters in documentation or code comments. Always use the alternatives listed below:

- **Em-dash (—)**: Use hyphen (-) instead
- **Curly quotes ("" '')**: Use straight quotes ("" '') instead
- **Ellipsis character (…)**: Use three periods (...) instead
- **Non-breaking space**: Use regular space instead

This ensures compatibility across different editors and environments.

## ⚠️ MVP STATUS AND DEVELOPMENT PHILOSOPHY ⚠️

**IMPORTANT**: pgflow is currently a Minimum Viable Product (MVP) in very early stages of development. When working on this codebase:

- **PRIORITIZE CUTTING SCOPE**: Focus on core functionality only - be ruthless about dropping nice-to-have features
- **SIMPLIFY AGGRESSIVELY**: Choose the simplest implementation that works, not the most elegant or complete
- **FOLLOW THE PARETO PRINCIPLE**: Aim for 80% of value with 20% of effort - perfect solutions are the enemy of shipped solutions
- **TIME IS CRITICAL**: Make time-saving tradeoffs even at the expense of minor technical debt
- **AVOID PREMATURE OPTIMIZATION**: Get it working first, optimize later only if absolutely necessary
- **LIMIT ABSTRACTIONS**: Introduce new patterns/abstractions only when absolutely needed

When suggesting changes or improvements, bias heavily toward solutions that can be implemented quickly with minimal complexity.

## Build/Test Commands

- `nx build <package>` - Build a specific package
- `nx test <package>` - Run tests for a specific package
- `nx test:pgtap <package>` - Run PostgreSQL tap tests
- `nx test:pgtap:watch <package>` - Run PostgreSQL tap tests in watch mode
- `nx test:vitest <package>` - Run vitest unit tests
- `nx lint <package>` - Run linting
- `nx fix-sql <package>` - Fix SQL formatting issues

## Code Style Guidelines

- **TypeScript**: Use strict mode with proper type annotations
- **Database**: PgFlow uses PostgreSQL for workflow orchestration
- **Imports**: Use package paths where defined (e.g., `@pgflow/core`, `@pgflow/dsl`)
- **Formatting**: Follow existing code style with proper indentation
- **Testing**: Write tests for both PostgreSQL functions (PgTAP) and TypeScript (Vitest)
- **Naming**: Use camelCase for variables/functions, PascalCase for classes/types
- **Error Handling**: Use proper error types and handle errors appropriately
- **File Structure**: Monorepo structure with packages in pkgs/ directory
- **Documentation Style**: Use impersonal, factual language. Avoid "we" and "our" when describing technical concepts, flows, or processes. Only use "you" when directly instructing the reader. Focus on what the system does, not who is doing it.

## Packages

- **core** - PostgreSQL-native workflow engine for defining, managing, and tracking DAG-based workflows
- **dsl** - TypeScript DSL for workflow definition with automatic type inference
- **edge-worker** - Task queue worker for Supabase Edge Functions with reliability features
- **cli** - Command-line interface for managing PgFlow deployments
- **example-flows** - Example workflow definitions using the DSL
- **website** - Documentation site for PgFlow

## Architecture & Key Conventions

See [CODEBASE.md](./CODEBASE.md) for:

- High-level architecture (3-layer model: DSL, SQL Core, Edge Worker)
- Design philosophy (Postgres-first, opinionated, robust yet simple)
- Key conventions (slug naming, DAG constraints, JSON serialization)
- Flow lifecycle overview

For documentation structure guidelines based on the Diátaxis framework, see [DIATAXIS.md](./DIATAXIS.md).

When working with this codebase, all changes should align with the principles in CODEBASE.md.

## MCP Tools for Web Reading/Crawling

For reading and crawling web content, Claude Code has access to an MCP server that provides enhanced web capabilities:

- **MCP Server**: c4ai-sse at http://localhost:11235/mcp/sse
- **Usage**: When you need to read web content or crawl websites, use the MCP tools instead of the standard WebFetch
- **Benefits**: The MCP tools provide more robust capabilities for web content extraction and processing

> [!WARNING]
> QUOTE ALL THE FILE PATHS THAT CONTAIN SPECIAL CHARACTERS LIKE '[run_id]'
> BECAUSE BRACKETS HAVE SPECIAL MEANING IN BASH!
> Do this: `cat 'some/path/to/[id]/page.tsx'` instead of `cat some/path/to/[id]/page.tsx`
