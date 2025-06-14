# pgflow – Codebase High-Level Overview

## Purpose

pgflow exists to let developers orchestrate complex, _database-centric_ workflows without leaving Postgres/Supabase.  
It replaces external “control planes” (Airflow, Temporal, etc.) with a zero-deployment, SQL-native engine that is easy to reason about, easy to observe with ordinary SQL, and easy to scale via Supabase Edge Functions.

## Design Philosophy

1. Postgres is the **single source of truth** – every definition, every state transition, every queue lives inside the database.
2. **Opinionated over configurable** – we pick a clear “happy path” (DAGs, JSON payloads, id/slug naming, topological flow definition, etc.). If you agree with the opinions you get an ultra-simple mental model; if you don’t, pgflow is not for you.
3. **Robust yet simple** – ACID state transitions, transactional task polling, back-pressure via pgmq, but no exotic features (no dynamic DAG rewrites, no conditional branching for now, no custom persistence layers).
4. **Compile-time safety** – the TypeScript DSL ensures inputs/outputs line up; the SQL core enforces referential integrity; migrations are generated and applied, never built on the fly.
5. **Serverless-ready** – execution happens in stateless workers (Supabase Edge Functions) that can crash, scale, or redeploy at will. The database keeps the truth.

## Core Building Blocks

Layer 1 – Definition (DSL)
• Strongly-typed TypeScript API (`@pgflow/dsl`).  
• Generates:  
 – Flow shape (slug, steps, edges, runtime options).  
 – Handler functions (executed by Edge Worker).  
• Can be _compiled_ to SQL via `pgflow compile`, producing an idempotent migration file that inserts the flow & steps.

Layer 2 – Orchestration (SQL Core)
• Pure SQL (tables, constraints, functions, triggers).  
• Tables
– Static: `flows`, `steps`, `deps`.  
 – Runtime: `runs`, `step_states`, `step_tasks`.  
• Functions
– Definition: `create_flow`, `add_step`.  
 – Runtime: `start_flow`, `read_with_poll`, `start_tasks`, `complete_task`, `fail_task`.  
• Guarantees
– All operations are transactional.  
 – Visibility timeouts and exponential back-off handled in SQL.  
 – Foreign keys enforce DAG correctness (steps must be added topologically).

Layer 3 – Execution (Edge Worker)
• A tiny Node/deno script packaged as Supabase Edge Function.  
• Polls pgmq queue via `read_with_poll`, starts tasks with `start_tasks`, then executes handler for each returned input payload, calls back `complete_task` / `fail_task`.  
• Auto-restarts, trivial horizontal scaling, no local state.

## Supporting Tooling

CLI (`@pgflow/cli`)
• `install` – copies SQL migrations, patches `supabase/config.toml`, seeds `.env`.  
• `compile` – turns a `.ts` flow into a timestamped migration (`YYYYMMDDHHMMSS_create_<slug>_flow.sql`).  
• Plans: scaffold flows, local run/monitor, edge-worker template.

Website / Docs (`pgflow.dev`)
• Built with Astro / MDX, lives in `pkgs/website`.  
• Source of truth for conventions, examples, troubleshooting.

## Tech Stack

• PostgreSQL ≥14 (tested on 14-16).  
• pgmq for at-least-once message queueing.  
• Supabase (local & cloud) as the default distribution vehicle.  
• TypeScript, Deno (for compile step), Node (for CLI).  
• nx monorepo; packages in `pkgs/*`; strict lint, prettier, vitest.

## Key Conventions (Non-Negotiable)

• Slugs: ≤128 chars, no leading digit/underscore, no spaces, only `[a-zA-Z0-9_]`.  
• DAG only – no cycles, no conditional edges, no runtime mutation.  
• Steps are added in topological order (enforced by FK).  
• Handlers **must return JSON-serialisable values**.  
• Inputs/Outputs are immutable; changing a step requires bumping the flow slug.  
• Retries: `max_attempts≥1`, `base_delay≥1s`, `timeout≥3s`.  
• Supabase `config.toml` must enable connection pooler (`transaction` mode) and set `edge_runtime.policy = "per_worker"` (handled by `pgflow install`).

## Trade-offs & Non-Goals

• No long-running (> 150s) tasks inside Edge Worker yet - Edge Functions have a time limit
• No sub-flows / dynamic fan-out yet (fan-out _within_ a step via `task_index` roadmap).  
• No cron / schedule engine – start runs manually or via your own triggers, use Supabase pg_cron for recurring tasks.

## Typical Flow Life-Cycle

1. Author flow in TypeScript.
2. `npx pgflow compile` → migration SQL.
3. `supabase migration up` → schema + flow definitions live in Postgres.
4. Client calls `SELECT pgflow.start_flow('my_flow', '{"foo":"bar"}')`.
5. Worker polls, runs handlers, pushes results – state transitions in SQL.
6. When `remaining_steps = 0` the run is marked `completed`; aggregated output stored; your app can `LISTEN` or poll.

## Why This Document Matters

All subsequent AI-assisted code changes reference this overview as the “north star”.  
When we debate an architectural choice, add a CLI sub-command, or fix a bug, we check that it:
• Keeps the Postgres-first, three-layer model intact.  
• Respects the opinionated conventions above.  
• Preserves the **robust-yet-simple** ethos.

If a change conflicts with these principles we redesign rather than bolt on complexity.
