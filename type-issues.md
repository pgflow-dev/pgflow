Pgflow Client - Type-check failure report  
========================================

The 93 diagnostics fall into only a handful of root causes. The table
below shows each category, the compiler codes you saw and the **fix(es)**
you should apply.

┌─────────────────────────────┬──────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ Category                    │ TS codes     │ What to do                                                                      │
├─────────────────────────────┼──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ 1. Incorrect test mocks     │ 2339         │ **VERIFIED ISSUE**: Tests are mocking non-existent `version` and `definition`  │
│    using non-existent       │              │ fields on `FlowRow`. The actual database schema only has:                      │
│    database fields          │              │   • flow_slug, created_at, opt_max_attempts, opt_base_delay, opt_timeout       │
│                             │              │                                                                                 │
│                             │              │ **Fix**: Update test mocks to match real schema in:                            │
│                             │              │   • `__tests__/SupabaseBroadcastAdapter.test.ts` lines 504-505                │
│                             │              │   Remove references to `sampleFlowDefinition.version` and `.definition`       │
├─────────────────────────────┼──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ 2. Tests use broadcast      │ 2345         │ Tests call `run.updateState(broadcastEvent)` directly, but `updateState`       │
│    events instead of        │              │ expects typed events. **Fix**: Use event adapters in tests:                    │
│    typed events             │              │   ```ts                                                                         │
│                             │              │   import { toTypedRunEvent } from '../../src/lib/eventAdapters';              │
│                             │              │   run.updateState(toTypedRunEvent(broadcastRunCompleted));                     │
│                             │              │   ```                                                                           │
├─────────────────────────────┼──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ 3. Path can't be resolved   │ 2307         │ All "cannot find module '../../src/lib/…'" come from tests                     │
│    from test files          │              │ running **outside** `src`. **Fix**: Add path alias in `tsconfig.spec.json`:   │
│                             │              │   ```json                                                                       │
│                             │              │   {                                                                             │
│                             │              │     "compilerOptions": {                                                       │
│                             │              │       "baseUrl": ".",                                                          │
│                             │              │       "paths": {                                                               │
│                             │              │         "@client/*": ["src/*"]                                                 │
│                             │              │       }                                                                        │
│                             │              │     }                                                                          │
│                             │              │   }                                                                            │
│                             │              │   ```                                                                          │
│                             │              │   Then replace imports: `import { PgflowClient } from '@client/lib/PgflowClient'` │
├─────────────────────────────┼──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ 4. Unused variables /       │ 6133         │ Mostly inside `__tests__`. **Fix**: Relax linter for tests:                    │
│    imports                  │              │   ```json                                                                       │
│                             │              │   // pkgs/client/tsconfig.spec.json                                            │
│                             │              │   "compilerOptions": {                                                         │
│                             │              │     "noUnusedLocals": false,                                                   │
│                             │              │     "noUnusedParameters": false                                                │
│                             │              │   }                                                                            │
│                             │              │   ```                                                                          │
├─────────────────────────────┼──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ 5. Implicit-any parameters  │ 7006         │ Add explicit types in test helpers:                                            │
│    in arrow functions       │              │ `map((s: StepStateRow) => …)` or `(event: BroadcastRunEvent) => …`            │
├─────────────────────────────┼──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ 6. Blob constructor in mock │ 2554         │ **Fix**: Replace `new Blob()` with `new Blob([])` in                           │
│                             │              │ `__tests__/mocks/index.ts` line 101                                            │
├─────────────────────────────┼──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ 7. Access to protected      │ 2445         │ Cast to access private properties in tests:                                    │
│    Supabase props in tests  │              │ `expect((client as any).supabaseUrl).toBe(...)`                                │
├─────────────────────────────┼──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ 8. "Not all code paths…"    │ 7030         │ Return something from arrow callbacks in performance benchmarks                │
│    in perf benchmark        │              │                                                                                 │
└─────────────────────────────┴──────────────┴──────────────────────────────────────────────────────────────────────────────┘


Detailed step-by-step
---------------------

1. **Fix incorrect test mocks** (Category 1)  
   Remove references to non-existent `version` and `definition` fields:
   ```ts
   // __tests__/SupabaseBroadcastAdapter.test.ts lines 504-505
   expect(result.flow).toEqual(expect.objectContaining({
     flow_slug: FLOW_SLUG,
     // Remove these lines - fields don't exist in real schema:
     // version: sampleFlowDefinition.version,
     // definition: sampleFlowDefinition.definition
   }));
   ```

2. **Update tests to use event adapters** (Category 2)  
   Replace direct broadcast event usage:
   ```ts
   import { toTypedRunEvent, toTypedStepEvent } from '../../src/lib/eventAdapters';
   
   // Instead of: run.updateState(broadcastRunCompleted)
   run.updateState(toTypedRunEvent(broadcastRunCompleted));
   ```

3. **Add path alias for tests** (Category 3)  
   In `pkgs/client/tsconfig.spec.json`:
   ```json
   {
     "compilerOptions": {
       "baseUrl": ".",
       "paths": {
         "@client/*": ["src/*"]
       }
     }
   }
   ```

4. **Relax linter scope for tests** (Category 4)  
   In `pkgs/client/tsconfig.spec.json`:
   ```json
   "compilerOptions": {
     "noUnusedLocals": false,
     "noUnusedParameters": false
   }
   ```

5. **Fix small one-liners** (Categories 5-8)  
   • Replace `new Blob()` with `new Blob([])` in `__tests__/mocks/index.ts`  
   • Add explicit types to arrow function parameters  
   • Cast to access private properties: `(client as any).privateProperty`  
   • Ensure all arrow callbacks return values

6. **Remove unused import**  
   Remove unused `FlowStepStatus` import from `src/lib/PgflowClient.ts`

After these fixes `nx run client:typecheck` should compile cleanly.