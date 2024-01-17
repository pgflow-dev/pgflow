<script lang="ts">
	import Prompt from '$components/Prompt.svelte';
	import { RemoteRunnable } from 'langchain/runnables/remote';
	import { PUBLIC_EDULAW_URL } from '$env/static/public';

	export let currentMessage: string;
	export let inProgress: boolean;
	let response: any;

	async function runChain() {
		const chain = new RemoteRunnable({ url: PUBLIC_EDULAW_URL });
		response = await chain.invoke({ question: currentMessage });
	}
</script>

<div class="">
	{response}
</div>

<Prompt
	bind:value={currentMessage}
	bind:inProgress
	on:submit={runChain}
	placeholder="Enter a message to check sentiment"
/>
