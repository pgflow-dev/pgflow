# Test lifecycle

Nx owns pgflow test setup and cleanup. Start a delivery from a fresh environment:

```bash
pnpm nx test-env:fresh edge-worker
```

The target takes the environment lock first. It then previews and locks every pgflow stack resource, the integration database, and the core upgrade fixture before it stops or removes anything. It stops only Nx-owned lifecycle processes from this workspace. If another worktree still holds a resource lock, recovery stops before it changes that resource. Locks live in the repository Git common directory, so sibling worktrees and sandboxes share them.

Run fresh setup again after an interrupted database or E2E check. Then run the requested Nx target. Do not clean Docker containers or process names by hand.

Run one pgTAP file without bypassing migration setup:

```bash
pnpm nx test:pgtap:file core --args=--file=supabase/tests/add_step/basic_step_addition.test.sql
```

Run one edge-worker integration file without bypassing the integration database or package builds:

```bash
pnpm nx test:integration:file edge-worker --args=--file=tests/integration/creating_queue.test.ts
```

Both focused targets use the local direct-argv Nx executor. `--args=--file=...` stays part of the task hash, but the selector never enters a shell command. The target accepts one existing regular file inside its supported subtree when Nx includes it in its file map. Nonignored in-tree files work before Git tracks them. Git-ignored files work only when `.nxignore` re-includes them. `./` paths work. Empty, missing, absolute, option-like, traversal, quote/substitution, external, ignored, and symlink-escaping selectors fail before the runner starts.

Use full E2E targets. E2E files share workers and database state.

```bash
pnpm nx e2e edge-worker
pnpm nx e2e:portable-runtimes edge-worker
```

Each E2E invocation holds the edge-worker stack lock through migration materialization, dependency sync, endpoint probe, and the full suite. It prepares the current migration mirror before the running-stack fast path. The runner waits for its own serve output, captures that invocation's exact runtime-container ID, monitors the serve child during the probe and suite, and removes only that captured ID during cleanup. A stale listener, ready-then-exit server, or later replacement container cannot certify success.

Database materialization stores two successful identities in the live database: database content (migrations and seed) and the full stack/setup input (config, setup helpers, lockfile, and Supabase CLI version). A stack/setup change invalidates old evidence, restarts the stack from current configuration, resets content, then writes both identities only after success. Matching identities reuse a healthy environment. `core:verify-migrations` remains uncached; cached tests and generators still hash their runtime, setup, and helper inputs.

One project-id resource lock protects each Supabase stack. Startup, restart, reset, migration materialization, and every live consumer use the same lock through its critical section. The integration database has its own full-suite lock.

Save complete slow-check output and preserve the Nx status:

```bash
set -o pipefail
pnpm nx test:integration edge-worker 2>&1 | tee /path/you-retain/edge-worker-integration.log
status=${PIPESTATUS[0]}
```

Do not use `--skip-nx-cache`. Run lifecycle regressions with:

```bash
pnpm nx test:lifecycle edge-worker
```
