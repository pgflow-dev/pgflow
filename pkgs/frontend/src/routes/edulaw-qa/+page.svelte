<script lang="ts">
	import { onDestroy } from 'svelte';
	import Prompt from '$components/Prompt.svelte';
	import { RemoteRunnable } from 'langchain/runnables/remote';
	import { PUBLIC_EDULAW_URL } from '$env/static/public';

	export let currentMessage: string = 'jakie prawa ma uczeń w polskiej szkole?';
	export let inProgress: boolean;
	let response: string = '';
	let timeElapsedMs: number | undefined = undefined;
	let interval: ReturnType<typeof setInterval>;

	async function runChain() {
		inProgress = true;
		response = '';
		timeElapsedMs = 0;

		const startTime = performance.now(); // Start the timer
		const chainUrl = `${PUBLIC_EDULAW_URL}/qa`;
		const chain = new RemoteRunnable({ url: chainUrl, options: { timeout: 45000 } });

		// Start updating time every 10ms
		interval = setInterval(() => {
			timeElapsedMs = performance.now() - startTime;
		}, 10);

		try {
			const stream = await chain.stream({ query: currentMessage });

			//timeElapsedMs = performance.now() - startTime;
			response = '';

			for await (const chunk of stream) {
				console.log('chunk', chunk);
				if (chunk && typeof chunk === 'string') {
					response += chunk;
					timeElapsedMs = performance.now() - startTime;
				}
			}
		} finally {
			clearInterval(interval);
			timeElapsedMs = performance.now() - startTime;
			inProgress = false;
			currentMessage = '';
		}
	}

	onDestroy(() => {
		if (interval) {
			clearInterval(interval);
		}
	});
</script>

<div class="flex flex-col h-screen relative">
	<div class="flex-grow flex items-end justify-center">
		<div class="w-full flex justify-center p-4">
			<div class="w-3/4 text-justify overflow-hidden">
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
			/>
		</div>
	</div>

	{#if timeElapsedMs}
		<div class="absolute bottom-0 right-0 p-4 text-xs text-gray-500 font-mono">
			{timeElapsedMs.toFixed(0)}ms
		</div>
	{/if}
</div>
