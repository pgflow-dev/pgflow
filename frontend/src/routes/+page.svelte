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
			placeholder="Enter a message to check sentiment"
		/>
	</div>

	<div class="w-1/3 flex items-center justify-center">
		{#if sentiment}
			{#if sentiment === 'POSITIVE'}
				<span class="badge variant-filled-success">POSITIVE</span>
			{:else if sentiment === 'NEGATIVE'}
				<span class="badge variant-filled-error">NEGATIVE</span>
			{:else}
				<span class="badge variant-filled-secondary">NEUTRAL</span>
			{/if}
		{/if}
	</div>
</div>
