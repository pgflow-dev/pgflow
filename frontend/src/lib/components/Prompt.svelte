<script lang="ts">
	import { ProgressRadial } from '@skeletonlabs/skeleton';
	import { createEventDispatcher, tick } from 'svelte';
	const dispatch = createEventDispatcher();

	export let value: string;
	export let placeholder: string;
	export let inProgress: boolean = false;
	export let label = 'Check sentiment';

	let input: HTMLInputElement;

	async function focusInput() {
		await tick();
		input?.focus();
	}

	function dispatchSubmit() {
		if (!inProgress && value.length) {
			dispatch('submit');
		}
	}

	$: !inProgress && focusInput();
</script>

<div class="input-group input-group-divider grid-cols-[1fr_auto] rounded-container-token">
	<form class="form" on:submit|preventDefault={dispatchSubmit}>
		<input
			bind:value
			bind:this={input}
			disabled={inProgress}
			class="input"
			type="text"
			{placeholder}
		/>
	</form>
	{#if inProgress}
		<button class="variant-filled-primary" disabled={true}>
			<ProgressRadial width="w-8" stroke={100} />
		</button>
	{:else}
		<button
			on:click={dispatchSubmit}
			disabled={inProgress || !value}
			class="variant-filled-primary"
		>
			{label}
		</button>
	{/if}
</div>
