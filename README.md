# pgflow

**pgflow** - Postgres-centric workflow engine with deep integration with Supabase

#### check docs at [pgflow.dev](https://pgflow.dev)

## Monorepo

This repository is a monorepo.
Packages live in `pkgs/` (its less tha `packages/` and does not confuse TAB completion with package.json :)).

| Nx Package                         | Description                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| [edge-worker](./pkgs/edge-worker/) | An auto-restarting task queue worker implemented for Supabase Edge Functions and PGMQ |
| [website](./pkgs/website/)         | Documentation Site                                                                    |

## NX Readme

See [NX_README.md](./NX_README.md) for more information.
