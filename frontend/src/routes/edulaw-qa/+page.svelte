<script lang="ts">
	import Prompt from '$components/Prompt.svelte';
	import { RemoteRunnable } from 'langchain/runnables/remote';
	import { PUBLIC_EDULAW_URL } from '$env/static/public';

	export let currentMessage: string;
	export let inProgress: boolean;
	let response: string = '';
	let timeElapsedMs: number | undefined = undefined;

	async function runChain() {
		inProgress = true;
		response = '...';
		timeElapsedMs = 0;

    const startTime = performance.now(); // Start the timer
		const chain = new RemoteRunnable({ url: PUBLIC_EDULAW_URL });
		const stream = await chain.stream({ question: currentMessage });

		timeElapsedMs = performance.now() - startTime;
		response = '';

		for await (const chunk of stream) {
			if (chunk) {
				if (typeof chunk === 'string') {
					response += chunk;
					timeElapsedMs = performance.now() - startTime;
				}
			}
		}

		timeElapsedMs = performance.now() - startTime;
		inProgress = false;
		currentMessage = '';
	}
</script>

<div class="flex h-screen">
	<div class="w-1/2 flex items-center justify-center">
		<div class="mb-8 text-left p-4 h-24"></div>

		<Prompt
			bind:value={currentMessage}
			bind:inProgress
			on:submit={runChain}
			placeholder="prawo oświatowe i edukacja w polsce"
			label="zapytaj"
			loadingLabel="pytam..."
		/>
	</div>

	<div class="w-1/2 flex items-center justify-center">
		<div class="w-3/4 mx-auto h-24 p-4 text-left">
			{#if timeElapsedMs}
				<p class="text-gray-200 text-xs">{timeElapsedMs}ms</p>
			{/if}
			{response}
		</div>
	</div>
</div>
