## UNIT TESTS

1. Common mocks

   - [ ] `mockSupabase()` helper returning a fully stubbed `SupabaseClient` (rpc, schema, channel)
   - [ ] `mockRealtimeChannel()` with `.on()`, `.subscribe()`, `.unsubscribe()`, `.send()` tracking
   - [ ] `resetMocks()` that wraps `vi.restoreAllMocks()` and clears global singleton state

2. FlowRun

   - [ ] status precedence: higher precedence wins, terminal states are immutable
   - [ ] event → state mapping (`started`, `completed`, `failed`)
   - [ ] `waitForStatus()` resolves / rejects correctly (use `vi.useFakeTimers()`)
   - [ ] step caching (`run.step('x')` returns same instance)
   - [ ] auto-dispose when (terminal state && no listeners)
   - [ ] protection against foreign-run events (ignored)

3. FlowStep

   - [ ] status precedence & terminal protections
   - [ ] event → state mapping
   - [ ] `waitForStatus()` behaviour

4. SupabaseBroadcastAdapter

   - [ ] channel naming & subscription (`pgflow:run:{id}`)
   - [ ] broadcast routing: events starting with `run:` emit `runEvent`, `step:` emit `stepEvent`
   - [ ] unsubscribe actually closes the channel
   - [ ] reconnection logic: on `system:error` trigger, calls `getRunWithStates()` and re-subscribes  
          (use fake timers & mocked promise resolution order)
   - [ ] snapshot refresh correctly re-emits run + step events

5. PgflowClient
   - [ ] `startFlow` calls `rpc('start_flow_with_states', …)` with deterministic `run_id`
   - [ ] instance caching: second `getRun(run_id)` returns cached FlowRun
   - [ ] broadcast → FlowRun propagation (run + step)
   - [ ] `dispose()` and `disposeAll()` cascade to adapter and run instances
   - [ ] error bubble-up: failed rpc rejects and cleans up

---

## INTEGRATION / CONTRACT TESTS

These simulate the full path “Supabase broadcast → client adapter → FlowRun / FlowStep”.

1. Happy path flow

   - [ ] create client, start flow
   - [ ] emit `run:started`, `step:started`, `step:completed`, `run:completed`
   - [ ] assert final FlowRun + FlowStep states

2. Duplicate / out-of-order events

   - [ ] sending stale lower-precedence event after completion is ignored

3. Reconnection round-trip

   - [ ] emit `system:error`, advance fake timers, ensure adapter:
         • calls `getRunWithStates()`  
          • re-subscribes  
          • replays snapshot into FlowRun

4. `waitForStatus` race
   - [ ] call `waitForStatus('completed')`, emit event, fast-forward time, promise resolves

---

## TESTING UTILITIES

- [ ] `emit(channel, type, payload)` helper to simulate realtime broadcast
- [ ] `advanceAndFlush(ms)` to `runAllTimers()` + microtask flush
- [ ] fixtures: `startedRunSnapshot`, `completedRunSnapshot`, `stepStatesSample`

---

## MOCKING STRATEGY CHECK (Vitest docs compliance)

✔ Use `vi.fn()` / `vi.mock()` for Supabase pieces  
✔ Always clear mocks in `afterEach` (`resetMocks()`)  
✔ Use `vi.useFakeTimers()` + `vi.runAllTimers()` for `waitForStatus` tests  
✔ For reconnection delay use `vi.advanceTimersByTime()`  
✔ Class mocking not required; functional mocks are enough

---

## DE-SCOPED / REMOVED TODOS

- Verify payload compatibility between SQL and TypeScript types ➜ belongs to core layer
- Type enhancement plan (flow registry, dtslint, etc.) ➜ out of client MVP
- “Component interactions” bullet (was React-specific) ➜ not relevant

---

## OPEN QUESTIONS (flagged for later but NOT blocking MVP)

- Memory-leak tracking with heap snapshots after many subscribe/unsubscribe cycles?
- Should we fuzz unknown broadcast event strings for resilience?
