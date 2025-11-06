# Migration Guide: Improved pgflow State Management

## Summary of Improvements

The improved pattern fixes these key issues:

1. ✅ **Auto-discovers steps** - No more manual step lists
2. ✅ **Better abstraction** - Wraps FlowRun lifecycle, not client factory
3. ✅ **Cleaner API** - Simpler configuration, fewer parameters
4. ✅ **More flexible** - Can attach to existing runs via `getRun()`
5. ✅ **Follows docs** - Aligns with documented pgflow patterns

## Side-by-Side Comparison

### Creating the Store

**Before (Original):**

```typescript
const pgflowState = createPgflowState<typeof ArticleFlow>(
	pgflow,
	'article_flow',
	['fetch_article', 'summarize', 'extract_keywords', 'publish'] // ❌ Manual list
);
```

**After (Improved):**

```typescript
const flowState = createFlowState<typeof ArticleFlow>(
	pgflow,
	'article_flow'
	// ✅ Steps auto-discovered from run
);
```

### Starting a Flow

**Before:**

```typescript
await pgflowState.startFlow({ url: 'https://example.com' });
```

**After (Same):**

```typescript
await flowState.startFlow({ url: 'https://example.com' });
```

### Accessing State

**Before:**

```svelte
<p>Status: {pgflowState.status}</p><p>Active: {pgflowState.activeStep}</p>
```

**After (Same):**

```svelte
<p>Status: {flowState.status}</p><p>Active: {flowState.activeStep}</p>
```

### Cleanup

**Before:**

```typescript
pgflowState.dispose();
```

**After (Same):**

```typescript
flowState.dispose();
```

## New Capability: Attach to Existing Runs

The improved version can also attach to existing runs:

```typescript
// Get a run that was started elsewhere
const existingRun = await pgflow.getRun('run-id');

if (existingRun) {
	flowState.attachRun(existingRun);
}
```

This enables monitoring flows started by:

- Supabase RPC
- pg_cron
- Database triggers
- Other components

## Complete Migration Example

### Original Code

```svelte
<script lang="ts">
	import { pgflow } from '$lib/supabase';
	import { createPgflowState } from '$lib/stores/pgflow-state.svelte';
	import type ArticleFlow from './article_flow';

	const pgflowState = createPgflowState<typeof ArticleFlow>(pgflow, 'article_flow', [
		'fetch_article',
		'summarize',
		'extract_keywords',
		'publish'
	]);

	async function startTestFlow() {
		try {
			await pgflowState.startFlow({
				url: 'https://enaix.github.io/2025/10/30/developer-verification.html'
			});
		} catch (error) {
			console.error('Failed to start flow:', error);
		}
	}
</script>

<p class="status-badge {pgflowState.status}">{pgflowState.status}</p>
{#if pgflowState.activeStep}
	<p class="active-step">Active Step: {pgflowState.activeStep}</p>
{/if}
```

### Migrated Code

```svelte
<script lang="ts">
	import { pgflow } from '$lib/supabase';
	import { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import type ArticleFlow from './article_flow';
	import { onDestroy } from 'svelte';

	// ✅ No step list needed
	const flowState = createFlowState<typeof ArticleFlow>(pgflow, 'article_flow');

	async function startTestFlow() {
		try {
			await flowState.startFlow({
				url: 'https://enaix.github.io/2025/10/30/developer-verification.html'
			});
		} catch (error) {
			console.error('Failed to start flow:', error);
		}
	}

	// ✅ Automatic cleanup on unmount
	onDestroy(() => flowState.dispose());
</script>

<p class="status-badge {flowState.status}">{flowState.status}</p>
{#if flowState.activeStep}
	<p class="active-step">Active Step: {flowState.activeStep}</p>
{/if}
```

## Migration Checklist

- [ ] Replace `createPgflowState` imports with `createFlowState`
- [ ] Remove manual step slug arrays from store creation
- [ ] Add `onDestroy` lifecycle hook for cleanup
- [ ] Update all `pgflowState` references to `flowState` (or keep original naming)
- [ ] Test that step events still fire correctly
- [ ] Verify cleanup happens on unmount

## Why These Changes?

### 1. Auto-Discovery is More Robust

**Problem:** Manual step lists can get out of sync with flow definitions

```typescript
// ❌ Error-prone: Must update in multiple places
const flow = new Flow(...)
  .step({ slug: 'new_step' }, ...)  // Added here

const state = createPgflowState(..., [
  'fetch', 'summarize'
  // ❌ Forgot to add 'new_step'!
]);
```

**Solution:** Steps are discovered from runtime state

```typescript
// ✅ Always in sync
const state = createFlowState(...);
await state.startFlow(...);
// Steps auto-discovered from run.stepStates
```

### 2. Better Separation of Concerns

**Original approach:**

- Store wraps PgflowClient (a factory)
- Mixes client operations with state management
- Client is recreated for each flow type

**Improved approach:**

- Store wraps FlowRun (the reactive entity)
- Client stays as documented: a factory for runs
- Each flow type gets its own state instance

### 3. Enables Run Monitoring

```typescript
// Monitor a flow started by pg_cron
const cron_run = await pgflow.getRun('cron-run-id');
flowState.attachRun(cron_run);

// Now you can track it in your UI
console.log(flowState.status);
```

## When to Use Each Pattern

| Pattern             | Use When                                         |
| ------------------- | ------------------------------------------------ |
| **createFlowState** | You need module-level state that can be shared   |
| **useFlowRun**      | You need component-local state with auto-cleanup |
| Original            | You're migrating incrementally (keep using it)   |

## Questions?

The improved pattern is fully compatible with the original API surface, just:

- Removes one parameter (step list)
- Adds one method (`attachRun`)
- Same reactive properties
- Same cleanup story
