<script lang="ts">
	import { onDestroy } from 'svelte';
	import ChatLayout from '$components/ChatLayout.svelte';
	import Prompt from '$components/Prompt.svelte';
	import { RemoteChain } from '$lib/remoteRunnables';

	export let data;
	let { session } = data;
	$: ({ session } = data);

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
		const chain = RemoteChain('hierarchical-qa', session, { timeout: 30000 });

		// Start updating time every 10ms
		interval = setInterval(() => {
			timeElapsedMs = performance.now() - startTime;
		}, 10);

		try {
			const stream = await chain.stream(currentMessage);

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

<ChatLayout>
	<svelte:fragment slot="messages">
		{response}
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt
			bind:value={currentMessage}
			bind:inProgress
			on:submit={runChain}
			placeholder="prawo oświatowe i edukacja w polsce"
			label="zapytaj"
		/>

		{#if timeElapsedMs}
			<div class="absolute bottom-0 right-0 p-4 text-xs text-gray-500 font-mono">
				{timeElapsedMs.toFixed(0)}ms
			</div>
		{/if}
	</svelte:fragment>
</ChatLayout>
