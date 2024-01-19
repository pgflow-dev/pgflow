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

<div class="flex flex-col h-screen">
	<div class="flex-grow flex items-end justify-center">
		<div class="w-full flex justify-between p-4">
			<div class="w-3/4 mx-auto text-justify overflow-hidden">
				{response}
			</div>
		</div>
	</div>
	<div class="w-full p-4">
		<div class="w-3/4 mx-auto pb-10">
			<Prompt
				bind:value={currentMessage}
				bind:inProgress
				on:submit={runChain}
				placeholder="prawo oświatowe i edukacja w polsce"
				label="zapytaj"
				loadingLabel="pytam..."
			/>
		</div>
		{#if timeElapsedMs}
			<span class="text-gray-600 text-sm font-mono">{timeElapsedMs}ms</span>
		{:else}
			<span class="text-gray-600 text-sm font-mono"></span>
		{/if}
	</div>
</div>
