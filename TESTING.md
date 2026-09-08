# Test lifecycle

Nx owns pgflow test setup and cleanup. Start a delivery from a fresh environment:

```bash
pnpm nx test-env:fresh edge-worker
```

The target runs every `supabase:stop` target in the current Nx workspace. It also removes the edge-worker integration database, its volumes, current-worktree test processes, and the upgrade fixture. It is safe when those resources are already stopped. It never starts a service or targets Supabase projects outside this workspace.

Run it again after an interrupted database or E2E check. Then run the requested Nx target, which starts its dependencies.

Run one pgTAP file without bypassing migration setup:

```bash
pnpm nx test:pgtap:file core --args=--file=supabase/tests/add_step/basic_step_addition.test.sql
```

Run one edge-worker integration file without bypassing the integration database or package builds:

```bash
pnpm nx test:integration:file edge-worker --args=--file=tests/integration/creating_queue.test.ts
```

Use full E2E targets. The files share long-lived edge workers and database state, so a single file is not independently isolated. Each E2E target waits for output from its current function-server target, then checks an endpoint-specific status and response body. A stale Kong listener alone cannot satisfy both checks.

Save complete slow-check output and preserve the exit status before extracting a short summary:

```bash
set -o pipefail
pnpm nx test:integration edge-worker 2>&1 | tee /tmp/edge-worker-integration.log
```

Stable failure markers:

- Nx: `Failed tasks:` and `Running target ... failed`
- Deno: `... FAILED`, `FAILED |`, and the `=> ./path:line` block
- pgTAP: `Result: FAIL`, `Failed test:`, and `Looks like you failed`
- Vitest: `FAIL`, `Test Files`, and `Tests`

Do not add `--skip-nx-cache` to routine commands. Nx caches test targets only when their declared runtime, test, configuration, migration, argument, and dependency inputs match. Lifecycle targets remain uncached.
