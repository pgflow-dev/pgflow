<script lang="ts">
	import Prompt from '$components/Prompt.svelte';
	import { RemoteRunnable } from 'langchain/runnables/remote';
	import { PUBLIC_EDULAW_URL } from '$env/static/public';

	export let currentMessage: string = 'jakie prawa ma uczeń w polskiej szkole?';
	export let inProgress: boolean;
	let response: string = '';
	let timeElapsedMs: number | undefined = undefined;

	async function runChain() {
		inProgress = true;
		response = '...';
		timeElapsedMs = 0;

		const startTime = performance.now(); // Start the timer
		const chain = new RemoteRunnable({
			url: PUBLIC_EDULAW_URL,
			options: { timeout: 45000 }
		});
		const stream = await chain.stream({ query: currentMessage });

		timeElapsedMs = performance.now() - startTime;
		response = '';

		for await (const chunk of stream) {
			console.log('chunk', chunk);
			if (chunk && typeof chunk === 'string') {
				response += chunk;
				timeElapsedMs = performance.now() - startTime;
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
		{#if timeElapsedMs}
			<span class="ml-8 text-gray-300 text-sm font-mono">{timeElapsedMs}ms</span>
		{/if}
		<div class="w-3/4 mx-auto h-24 p-4 text-left">
			{response}
		</div>
	</div>
</div>
