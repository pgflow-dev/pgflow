## Pragmatic Test Plan for `pkgs/client` (80 % value / 20 % effort)

Below is a layered strategy that gives you **confidence in the critical logic & typings** without drowning in boiler-plate.  
Directory suggestions assume Vitest (already in the repo) + Playwright for E2E. Feel free to rename.

```
pkgs/
└─ client/
   ├─ src/
   └─ tests/
      ├─ unit/
      ├─ integration/
      ├─ types/
      └─ e2e/   (in website app or example-nextjs project)
```

---

### 1. Unit tests  (≈ 60 % of value, cheapest to add)

Scope  
• Pure state-machines (`FlowRun`, `FlowStep`)  
• Event precedence / auto-dispose logic  
• Simple helpers in `SupabaseBroadcastAdapter` that don’t hit the network.

Tools  
• Vitest + [@vitest/spy](https://vitest.dev/api/) for spies  
• Tiny hand-rolled stubs instead of big mocks – remember MVP guideline.

Example (pseudo-code):

```ts
import { FlowRunStatus } from '@/src/lib/types';
import { FlowRun } from '@/src/lib/FlowRun';

test('run ignores lower-precedence status updates', () => {
  const run = givenRun({ status: FlowRunStatus.Started });
  const updated = run.updateState({ run_id: run.run_id, status: 'queued' as any });
  expect(updated).toBe(false);
  expect(run.status).toBe(FlowRunStatus.Started);
});
```

Quick wins  
1. Happy path update for run + step.  
2. Precedence / terminal-state immutability.  
3. `waitForStatus` resolves, times-out, and aborts.  
4. `SupabaseBroadcastAdapter.#handleBroadcastMessage` routes events correctly (pass in dummy payloads).

Target: **10-15 focused specs** – you’ll catch >80 % regressions.

---

### 2. Type–safety tests (≈ 15 % of value, trivial effort)

Use [`tsd`](https://github.com/SamVerschueren/tsd) – zero-runtime, compile-time only.

```
pnpm add -D tsd
```

tests/types/flow-run.d.ts:

```ts
import { Flow } from '@pgflow/dsl';
import { FlowRun } from '@/src/lib/FlowRun';

declare const f: Flow<{name:string}>;
declare const run: FlowRun<typeof f>;

// ✅ should compile
run.input.name;

// ❌ should fail – wrong prop
// @ts-expect-error
run.input.foo;
```

Run with `tsd` in CI. Five-ten assertions are usually enough.

---

### 3. Integration tests (≈ 15 % of value, moderate effort)

Goal: confirm the **contract between client and DB RPC / Realtime payloads**.

Cheapest path:

1. Spin up Supabase in Docker only once for the suite (`supabase start`) OR mock HTTP with [evaluate-mock-server](https://github.com/mswjs/msw) if Docker is over-kill right now.
2. Seed a tiny schema that contains:
   - `pgflow.start_flow_with_states`
   - `get_run_with_states`
   - minimal `broadcast` messages.

3. Use the real `PgflowClient` against it:
   - Start a flow, assert that returned `FlowRun` goes from `queued` → `started`.
   - Insert a `run:completed` broadcast message – expect the in-memory run to update.

4. Test reconnection logic:
   - Close channel, wait, emit again, ensure `#reconnectChannel` fetches snapshot.

Keep the fixture SQL small; **one “hello-world” flow** is enough.

---

### 4. End-to-end tests (≈ 10 % of value, optional for MVP)

If you have a demo site / example-app:

1. Use Playwright:
   - Run website in CI (`next dev -p 4321` or similar).
   - Trigger “Start Flow” button.
   - Wait for UI to show “completed”.

2. Record Lighthouse trace if perf matters later.

Because the backend work is already covered by Integration tests, a single happy-path UI flow is sufficient for MVP.

---

### 5. Coverage targets & CI

• Set Vitest coverage threshold to **60-70 %** lines – enough to warn on large drops.  
• Add `pnpm test:unit`, `test:types`, `test:int` scripts; gate PRs in GitHub Actions.

---

## Cheat-sheet of high-value test cases

| Layer | Must-have cases | Nice-to-have |
|-------|-----------------|--------------|
| Unit  | status precedence, event emission, auto-dispose, waitForStatus timeout, adapter routing | validate slug util, runtime options validation |
| Types | correct `run.input` / `step.output`, compile error on wrong deps | compileFlow sql strings type inference |
| Int   | startFlow happy path, realtime event updates, reconnection snapshot | failure path w/ retries |
| E2E   | user triggers flow → sees “completed” | parallel steps visualised |

---

## Tips to keep effort low

1. **No mocking frenzy** – only mock Supabase where network hurts speed.  
2. Share JSON fixtures (broadcast events, run snapshots) across unit + int tests.  
3. For real Supabase you can skip auth by using `anon` key in local dev.  
4. Run Playwright headed only on failure (`--headed`) to speed up CI.

Following this plan you’ll have **solid confidence in the critical state-machines and type contracts** with **minimal test code (≈300-400 LOC)**.
