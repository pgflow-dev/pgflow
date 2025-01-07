# pgflow

pgflow - Postgres-centric workflow engine with deep integration with Supabase

## Monorepo

This repository is a monorepo that contains the following packages:

| Nx Package     | NPM Package | Description |
|--------------|-------------|-------------|
| `supaworker` | `@pgflow/supaworker` | An auto-restarting task queue worker implemented for Supabase Edge Functions and PGMQ |
| `cli` | `@pgflow/cli` (`pgflow`) | A CLI tool for interacting with whole stack |

Tests:

| Nx Package       | NPM Package | Description |
|--------------|-------------|-------------|
| `supaworker-tests` | - | pgtap and e2e tests for supaworker |

## NX Readme

See [NX_README.md](./NX_README.md) for more information.
