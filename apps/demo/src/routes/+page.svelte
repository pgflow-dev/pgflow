<script lang="ts">
	import { onDestroy } from 'svelte';
	import { pgflow } from '$lib/supabase';
	import { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import type ArticleFlow from '../../supabase/functions/article_flow_worker/article_flow';

	// TODO: If we hit 3+ levels of prop drilling, switch to Context API
	// Reversal cost: 20 minutes (just add setContext/getContext)
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

	// Automatic cleanup on unmount
	onDestroy(() => flowState.dispose());
</script>

<div class="container">
	<h1>pgflow Demo - Phase 1 Vertical Slice</h1>

	<div class="controls">
		<button onclick={startTestFlow}>Start Test Flow</button>
	</div>

	<div class="status">
		<h2>Status</h2>
		<p class="status-badge {flowState.status}">{flowState.status}</p>
		{#if flowState.activeStep}
			<p class="active-step">Active Step: {flowState.activeStep}</p>
		{/if}
		{#if flowState.error}
			<p class="error-message">Error: {flowState.error}</p>
		{/if}
	</div>

	{#if flowState.output}
		<div class="output">
			<h2>Output</h2>
			<pre>{JSON.stringify(flowState.output, null, 2)}</pre>
		</div>
	{/if}

	{#if flowState.events.length > 0}
		<div class="events">
			<h2>Events ({flowState.events.length})</h2>
			{#each flowState.events as event}
				<div class="event-item">
					<span class="event-type">{event.event_type}</span>
					<span class="event-time">{event.timestamp.toLocaleTimeString()}</span>
					<pre>{JSON.stringify(event.data, null, 2)}</pre>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 800px;
		margin: 2rem auto;
		padding: 1rem;
	}

	h1 {
		margin-bottom: 2rem;
	}

	.controls {
		margin-bottom: 2rem;
	}

	button {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		cursor: pointer;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
	}

	button:hover {
		background: #45a049;
	}

	.status,
	.output,
	.events {
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.2rem;
		margin-bottom: 0.5rem;
	}

	pre {
		background: #f4f4f4;
		padding: 1rem;
		border-radius: 4px;
		overflow-x: auto;
		font-size: 0.9rem;
	}

	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background: #e3f2fd;
		border-radius: 4px;
		font-weight: 500;
		text-transform: uppercase;
		font-size: 0.85rem;
		transition: background-color 0.3s;
	}

	.status-badge.completed {
		background: #c8e6c9;
		color: #2e7d32;
	}

	.status-badge.failed,
	.status-badge.error {
		background: #ffcdd2;
		color: #c62828;
	}

	.status-badge.starting,
	.status-badge.started,
	.status-badge.in_progress {
		background: #fff9c4;
		color: #f57f17;
	}

	.active-step {
		color: #666;
		font-style: italic;
		margin-top: 0.5rem;
	}

	.error-message {
		color: #c62828;
		background: #ffebee;
		padding: 0.5rem;
		border-radius: 4px;
		margin-top: 0.5rem;
		border-left: 3px solid #c62828;
	}

	.event-item {
		margin-bottom: 1rem;
		padding: 0.5rem;
		border-left: 3px solid #2196f3;
		background: #fafafa;
	}

	.event-type {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		background: #2196f3;
		color: white;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 500;
		margin-right: 0.5rem;
	}

	.event-time {
		color: #666;
		font-size: 0.85rem;
	}

	.event-item pre {
		margin-top: 0.5rem;
		margin-bottom: 0;
	}
</style>
