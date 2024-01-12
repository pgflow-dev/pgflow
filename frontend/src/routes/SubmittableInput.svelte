<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	export let value: string;
	export let placeholder: string;
	export let inProgress: boolean = false;
</script>

<form class="form" on:submit|preventDefault={() => inProgress || dispatch('submit')}>
	<input bind:value disabled={inProgress} class="input" type="text" {placeholder} />
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
