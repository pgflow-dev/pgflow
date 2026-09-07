# pgflow CLI

The Command Line Interface for pgflow - a PostgreSQL-native workflow engine.

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.

## Overview

This package provides essential tools for setting up pgflow in your Supabase project. The CLI handles:

- Installing pgflow in your Supabase project
- Updating pgflow's project files (safe to re-run)

## Prerequisites

- Supabase CLI v2.50.3 or higher
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

## Building

Run `nx build cli` to build the library.

## Running unit tests

Run `nx test cli` to execute the unit tests via [Vitest](https://vitest.dev/).

## Documentation

For detailed documentation, visit:

- [Installation Guide](https://pgflow.dev/get-started/installation/)
- [Startup Compilation](https://pgflow.dev/concepts/startup-compilation/)
- [Running Flows](https://pgflow.dev/get-started/flows/run-flow/)
