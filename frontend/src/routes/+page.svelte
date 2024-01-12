<script lang="ts">
	import SubmittableInput from './SubmittableInput.svelte';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	let sentiment: string;
	let currentMessage = '';
	let inProgress = false;

	async function checkSentiment() {
		inProgress = true;
		const { data } = await supabase.functions.invoke('sentiment', {
			body: { input: currentMessage }
		});
		inProgress = false;
		sentiment = data[0].label;
	}
</script>

<div class="flex h-screen">
	<div class="w-1/3 flex items-center justify-center"></div>

	<div class="w-1/3 flex items-center justify-center">
		<SubmittableInput
			bind:value={currentMessage}
			bind:inProgress
			on:click={checkSentiment}
			placeholder="Enter a message"
		/>
	</div>

	<div class="w-1/3 flex items-center justify-center">
		{#if sentiment}
			{#if sentiment === 'POSITIVE'}
				<span class="text-success-500">POSITIVE</span>
			{:else if sentiment === 'NEGATIVE'}
				<span class="text-error-500">NEGATIVE</span>
			{:else}
				<span class="text-warning-500">NEUTRAL</span>
			{/if}
		{/if}
	</div>
</div>
