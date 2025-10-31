# pgflow + Svelte Integration Patterns

This document compares different approaches for integrating pgflow with Svelte 5 runes.

## The Core Issue

The current `createPgflowState` pattern has these problems:

1. **Hardcoded step slugs** - Error-prone duplication
2. **Wraps the wrong thing** - Wraps PgflowClient (factory) instead of FlowRun (reactive entity)
3. **Manual cleanup** - No integration with component lifecycle
4. **Deviates from docs** - Documented pattern is `pgflow.startFlow()` directly

## Recommended Pattern: `useFlowRun`

**Best for:** Component-level state with automatic cleanup

```svelte
<script lang="ts">
  import { pgflow } from '$lib/supabase';
  import { useFlowRun } from '$lib/stores/use-flow-run.svelte';
  import type ArticleFlow from './article_flow';

  let flowState = $state<ReturnType<typeof useFlowRun<typeof ArticleFlow>> | null>(null);

  async function startFlow() {
    // ✅ Use pgflow client directly (as documented)
    const run = await pgflow.startFlow<typeof ArticleFlow>('article_flow', {
      url: 'https://example.com'
    });

    // ✅ Wrap for reactive state + auto cleanup
    flowState = useFlowRun(run);
  }
</script>

{#if flowState}
  <p>Status: {flowState.status}</p>
  <p>Active: {flowState.activeStep}</p>

  {#each flowState.events as event}
    <div>{event.event_type} at {event.timestamp.toLocaleTimeString()}</div>
  {/each}
{/if}
```

**Advantages:**
- ✅ Follows documented pgflow patterns
- ✅ Auto-discovers steps from run state
- ✅ Automatic cleanup on unmount
- ✅ No manual step list needed
- ✅ Wraps FlowRun (correct abstraction)

**Disadvantages:**
- ❌ Tied to component lifecycle
- ❌ Harder to share across components

## Alternative: Store-Based Pattern

**Best for:** Module-level state shared across components

```typescript
// store.svelte.ts
import type { FlowRun } from '@pgflow/client';
import type { AnyFlow } from '@pgflow/dsl';

export function createFlowStore<TFlow extends AnyFlow>() {
  let run = $state<FlowRun<TFlow> | null>(null);
  let status = $state<string>('idle');
  let output = $state<any>(null);
  let events = $state<any[]>([]);

  const unsubscribers = $state.raw<Array<() => void>>([]);

  function setRun(flowRun: FlowRun<TFlow>) {
    // Clear previous subscriptions
    unsubscribers.forEach(u => u());
    unsubscribers.length = 0;

    run = flowRun;

    // Auto-discover steps
    const stepSlugs = flowRun.stepStates?.map(s => s.step_slug) || [];

    // Set up listeners...
    const unsub = flowRun.on('*', event => {
      events = [...events, event];
      status = event.status;
    });

    if (typeof unsub === 'function') {
      unsubscribers.push(unsub);
    }
  }

  function dispose() {
    unsubscribers.forEach(u => u());
    unsubscribers.length = 0;
    run = null;
    status = 'idle';
    events = [];
  }

  return {
    get run() { return run; },
    get status() { return status; },
    get events() { return events; },
    get output() { return output; },
    setRun,
    dispose
  };
}
```

```svelte
<!-- Component usage -->
<script lang="ts">
  import { pgflow } from '$lib/supabase';
  import { createFlowStore } from '$lib/stores/flow-store.svelte';
  import type ArticleFlow from './article_flow';

  const flowStore = createFlowStore<typeof ArticleFlow>();

  async function startFlow() {
    const run = await pgflow.startFlow<typeof ArticleFlow>('article_flow', {
      url: 'https://example.com'
    });

    flowStore.setRun(run);
  }

  // Manual cleanup when needed
  function cleanup() {
    flowStore.dispose();
  }
</script>
```

**Advantages:**
- ✅ Can be module-level (shared across components)
- ✅ Auto-discovers steps
- ✅ Explicit control over lifecycle
- ✅ No component coupling

**Disadvantages:**
- ❌ Manual cleanup required
- ❌ Need to remember to call dispose()

## Comparison Matrix

| Feature | Current Approach | useFlowRun | Store Pattern |
|---------|------------------|------------|---------------|
| Follows pgflow docs | ❌ | ✅ | ✅ |
| Auto-discover steps | ❌ | ✅ | ✅ |
| Auto cleanup | ❌ | ✅ | ❌ |
| Module-level | ✅ | ❌ | ✅ |
| Component-local | ❌ | ✅ | ❌ |
| Manual step list | ❌ | ✅ | ✅ |
| Wraps correct abstraction | ❌ | ✅ | ✅ |

## Recommendation

**For most use cases:** Use `useFlowRun`
- Simpler
- Automatic cleanup
- Follows documented patterns
- Auto-discovers steps

**For shared state:** Use store pattern
- When multiple components need the same run
- When you need explicit lifecycle control
- When you want module-level state

## Implementation Notes

### Auto-Discovering Steps

Both patterns discover steps from `run.stepStates`:

```typescript
const stepSlugs = run.stepStates?.map(s => s.step_slug) || [];
```

This is populated by `startFlow()` / `getRun()`, so no manual list needed.

### Type Safety

Both patterns maintain full type safety with the Flow definition:

```typescript
import type ArticleFlow from './article_flow';

const state = useFlowRun<typeof ArticleFlow>(run);
// state.output is fully typed
```

### Cleanup Patterns

**Automatic (useFlowRun):**
```typescript
// Cleanup happens automatically via onDestroy
const state = useFlowRun(run);
```

**Manual (Store):**
```typescript
const store = createFlowStore();
store.setRun(run);

// Later or on unmount:
store.dispose();
```

**With Svelte Context:**
```typescript
// In parent component
setContext('flow', store);
onDestroy(() => store.dispose());

// In child components
const flow = getContext<FlowStore>('flow');
```
