---
'pgflow': minor
'@pgflow/edge-worker': minor
---

## @pgflow/edge-worker

- Add ControlPlane HTTP server for flow compilation (`ControlPlane.serve()`)
- Support namespace imports for flow registration

## @pgflow/cli

### Breaking Changes

- `pgflow compile` now takes flow slug instead of file path
- Compilation happens via HTTP to ControlPlane (local Deno no longer required)
- Deprecate `--deno-json` flag (will be removed in v1.0)

### New Features

- `pgflow install` now scaffolds complete setup:
  - Creates `supabase/flows/` with example GreetUser flow
  - Creates `supabase/functions/pgflow/` Control Plane
  - Creates `supabase/functions/greet-user-worker/` example worker
- Add `--control-plane-url` option to compile command
- Dynamic version injection in generated deno.json files
