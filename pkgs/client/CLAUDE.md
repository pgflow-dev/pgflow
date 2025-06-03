# CLAUDE.md for @pgflow/client

This file provides specific guidance to Claude Code when working with the client package.

## Client Package Overview

The client package provides a TypeScript client for interacting with pgflow and observing workflow progress.

## Testing Commands

- `pnpm nx test client` - Run all client tests
- `pnpm nx lint client` - Run linting for client code

## Package-specific Guidelines

- Follow TypeScript best practices with proper type annotations
- Ensure backwards compatibility for public API methods
- Write comprehensive tests for all client functionality

## Integration Test Permissions Setup

**IMPORTANT**: When working with integration tests that use Supabase REST API to access pgflow schema:

### The Problem
The Supabase REST API (PostgREST) has strict schema access controls. By default, it only exposes `public` and `graphql_public` schemas. When integration tests try to access pgflow functions/tables through the Supabase client, they get permission errors like:
- "The schema must be one of the following: public, graphql_public"
- "permission denied for table runs/steps/flows"

### The Solution
1. **Supabase Configuration**: The `supabase/config.toml` file must include:
   ```toml
   [api]
   schemas = ["public", "graphql_public", "pgflow"]
   ```

2. **Function Security**: Use `SECURITY DEFINER` for pgflow functions that need to access internal tables:
   ```sql
   CREATE OR REPLACE FUNCTION pgflow.start_flow_with_states(...)
   RETURNS JSONB AS $$
   -- function body --
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```

3. **Minimal Permissions**: Grant only what's needed for the API user (`anon` role):
   ```sql
   GRANT USAGE ON SCHEMA pgflow TO anon;
   GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO anon;
   GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO anon;
   GRANT SELECT ON TABLE pgflow.flows TO anon;
   GRANT SELECT ON TABLE pgflow.steps TO anon;
   ```

### Why This Works
- `SECURITY DEFINER` allows functions to execute with the owner's privileges (postgres) rather than the caller's (`anon`)
- This provides a secure API boundary while allowing necessary database operations
- Only the minimal required permissions are granted to the API user

### Future Migration Needed
The `SECURITY DEFINER` approach should be added to the actual migrations in pkgs/core/schemas/ for production use, rather than just in tests.
