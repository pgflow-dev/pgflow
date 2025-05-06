# pgflow

Postgres-centric workflow engine with deep integration with Supabase

#### 🌐 check docs at [pgflow.dev](https://pgflow.dev)

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.

## Monorepo

This repository is a monorepo containing components of pgflow.
Packages live in `pkgs/`

| Package                                | Description                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| [cli](./pkgs/cli/)                     | Command-line interface for installing pgflow and compiling flows                      |
| [core](./pkgs/core/)                   | SQL Core for the workflow engine - foundational part of **pgflow** stack              |
| [dsl](./pkgs/dsl/)                     | Flow DSL - the TypeScript library used to define flows and their handlers             |
| [edge-worker](./pkgs/edge-worker/)     | An auto-restarting task queue worker implemented for Supabase Edge Functions and PGMQ |
| [website](./pkgs/website/)             | Documentation Site                                                                    |
| [example-flows](./pkgs/example-flows/) | Small package containing various example flows, mainly for exploration                |

## NX Readme

See [NX_README.md](./NX_README.md) for more information.
