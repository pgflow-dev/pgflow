<script lang="ts">
	import { pgflow } from '$lib/supabase';

	let status = $state<string>('idle');
	let output = $state<string>('');
	let events = $state<string[]>([]);

	async function startTestFlow() {
		status = 'starting...';
		events = [];
		output = '';

		try {
			const run = await pgflow.startFlow('test_flow', { message: 'World' });

			run.on('*', (event) => {
				events = [...events, JSON.stringify(event, null, 2)];
				status = event.status || status;

				if (event.status === 'completed' && event.output) {
					output = JSON.stringify(event.output, null, 2);
				}
			});
		} catch (error) {
			status = 'error';
			output = error instanceof Error ? error.message : String(error);
		}
	}
</script>

<div class="container">
	<h1>pgflow Demo - Phase 1 Vertical Slice</h1>

	<div class="controls">
		<button onclick={startTestFlow}>Start Test Flow</button>
	</div>

	<div class="status">
		<h2>Status</h2>
		<p>{status}</p>
	</div>

	{#if output}
		<div class="output">
			<h2>Output</h2>
			<pre>{output}</pre>
		</div>
	{/if}

	{#if events.length > 0}
		<div class="events">
			<h2>Events</h2>
			{#each events as event}
				<pre>{event}</pre>
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
</style>
