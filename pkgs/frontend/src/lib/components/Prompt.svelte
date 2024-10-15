<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	const dispatch = createEventDispatcher();

	export let value: string;
	export let placeholder: string;
	export let loading: boolean = false;
	export let label = 'Check sentiment';

	let input: HTMLInputElement;

	async function focusInput() {
		await tick();
		input?.focus();
	}

	function dispatchSubmit() {
		if (!loading && value.length) {
			dispatch('submit');
		}
	}

	$: !loading && focusInput();
</script>

<div class="input-group input-group-divider grid-cols-[1fr_auto] rounded-container-token">
	<form class="form" on:submit|preventDefault={dispatchSubmit}>
		<input
			bind:value
			bind:this={input}
			disabled={loading}
			class="input"
			type="text"
			{placeholder}
		/>
	</form>
	{#if loading}
		<button class="variant-filled-primary" disabled={true}> ⏳ </button>
	{:else}
		<button on:click={dispatchSubmit} disabled={loading || !value} class="variant-filled-primary">
			{label}
		</button>
	{/if}
</div>
