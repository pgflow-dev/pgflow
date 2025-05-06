# @pgflow/cli

The Command Line Interface for pgflow - a PostgreSQL-native workflow engine.

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.

## Overview

`@pgflow/cli` provides essential tools for setting up, managing, and deploying pgflow workflows in your Supabase environment. The CLI handles:

- Installing pgflow in your Supabase project
- Compiling TypeScript workflow definitions into SQL migrations
- Managing workflow deployment and updates

## Prerequisites

- Supabase CLI v2.0.2 or higher
- Deno v1.45.x or higher (for flow compilation)
- Local Supabase project initialized

## Installation

### Via npx (recommended)

```bash
# Run commands directly
npx pgflow@latest <command>
```

### Global installation

```bash
# Install globally
npm install -g pgflow

# Run commands
pgflow <command>
```

## Commands

### Install pgflow

Set up pgflow in your Supabase project with a single command:

```bash
npx pgflow@latest install
```

Options:

- `--supabase-path <path>` - Specify custom Supabase directory path
- `--yes` or `-y` - Skip confirmation prompts (non-interactive mode)

The installer will:

1. Update `config.toml` to enable required connection pooling
2. Copy pgflow SQL migrations to your project
3. Configure environment variables for Edge Functions
4. Guide you through applying migrations

### Compile Flow Definition

Convert a TypeScript flow definition into a SQL migration:

```bash
npx pgflow@latest compile supabase/functions/_flows/my_flow.ts
```

Options:

- `--deno-json <path>` - Path to custom deno.json with import map
- `--supabase-path <path>` - Path to custom Supabase directory

The compiler will:

1. Parse your TypeScript flow definition
2. Extract step dependencies and configuration
3. Generate SQL commands for database registration
4. Create a timestamped migration file in your migrations folder

## Building

Run `nx build cli` to build the library.

## Running unit tests

Run `nx test cli` to execute the unit tests via [Vitest](https://vitest.dev/).

## Documentation

For detailed documentation, visit:

- [Installation Guide](https://pgflow.dev/getting-started/install-pgflow/)
- [Compiling Flows](https://pgflow.dev/getting-started/compile-to-sql/)
- [Running Flows](https://pgflow.dev/getting-started/run-flow/)
