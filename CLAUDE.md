# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

> [!WARNING]
> QUOTE ALL THE FILE PATHS THAT CONTAIN SPECIAL CHARACTERS LIKE '[run_id]'
> BECAUSE BRACKETS HAVE SPECIAL MEANING IN BASH!
> Do this: `cat 'some/path/to/[id]/page.tsx'` instead of `cat some/path/to/[id]/page.tsx`