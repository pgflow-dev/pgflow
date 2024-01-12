<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	const dispatch = createEventDispatcher();

	export let value: string;
	export let placeholder: string;
	export let inProgress: boolean = false;

	let input: HTMLInputElement;

	async function focusInput() {
		await tick();
		input.focus();
	}

	$: !inProgress && focusInput();
</script>

<form class="form" on:submit|preventDefault={() => inProgress || dispatch('submit')}>
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
	<button type="button" class="btn variant-filled-primary" disabled={true}>checking ...</button>
{:else}
	<button
		type="button"
		class="btn variant-filled-primary"
		on:click={() => dispatch('submit')}
		disabled={inProgress || !value}
	>
		Check sentiment
	</button>
{/if}
