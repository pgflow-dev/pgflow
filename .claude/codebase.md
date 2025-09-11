# pgflow - Codebase Overview

## Purpose
Database-centric workflow orchestration in Postgres/Supabase. Replaces external control planes (Airflow, Temporal) with zero-deployment SQL-native engine.

## Design Philosophy
1. **Postgres = single source of truth** - All definitions, state transitions, queues in DB
2. **Opinionated over configurable** - Clear happy path (DAGs, JSON, topological order)
3. **Robust yet simple** - ACID transactions, pgmq, no exotic features
4. **Compile-time safety** - TypeScript DSL, SQL referential integrity, generated migrations
5. **Serverless-ready** - Stateless Edge Functions, DB keeps truth

## Three Levels of Abstraction

**Layer 3 - DSL (User Intent)**
- Thinks: "User wants to fanout over array, compile to step definitions"
- Focus: Type-safe method chaining (.step(), .array(), .fanout()), ghost step generation
- Doesn't care about: How tasks execute or DB state management
- Problem domain: Intuitive workflow definition with compile-time safety

**Layer 2 - SQL Core (Workflow Orchestration)**
- Thinks: "This step is ready, spawn N tasks, aggregate results"
- Focus: Dependency resolution, step_type patterns (single/array/fanout), state transitions
- Doesn't care about: DSL syntax or user intent
- Problem domain: Reliable DAG execution with well-defined step semantics

**Layer 1 - Worker (Task Execution)**
- Thinks: "Execute this handler with input, return output or error"
- Focus: Handler execution, input/output transformation, error handling
- Doesn't care about: Where tasks come from or workflow context
- Problem domain: Reliable execution of isolated units of work

## Tech Stack
- PostgreSQL ≥14, pgmq, Supabase
- TypeScript, Deno (compile), Node (CLI)
- nx monorepo, packages in `pkgs/*`

## Non-Negotiable Conventions
- Slugs: ≤128 chars, `[a-zA-Z0-9_]` only
- DAG only - no cycles/conditional edges
- Topological step order (FK enforced)
- JSON-serializable handler returns
- Immutable inputs/outputs
- Retries: `max_attempts≥1`, `base_delay≥1s`, `timeout≥3s`

## Trade-offs
- No >150s tasks (Edge Function limit)
- No sub-flows/dynamic fan-out yet
- No built-in cron (use pg_cron)

## Flow Lifecycle
1. Author TypeScript flow (DSL layer)
2. `pgflow compile` → migration SQL
3. `supabase migration up` → definitions in Postgres
4. `SELECT pgflow.start_flow('my_flow', '{}')` (SQL Core layer)
5. Worker polls, executes handlers (Worker layer)
6. Run completes when `remaining_steps = 0`

## North Star
All changes must: maintain abstraction separation, respect conventions, preserve robust-yet-simple ethos. Each layer solves its own class of problems without leaking concerns.