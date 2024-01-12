<script lang="ts">
	export let value: string;
	export let placeholder: string;
	export let inProgress: boolean = false;
</script>

<input bind:value disabled={inProgress} class="input" type="text" {placeholder} />

{#if inProgress}
	<button type="button" class="btn variant-filled-primary" disabled={true}>checking ...</button>
{:else}
	<button type="button" class="btn variant-filled-primary" on:click disabled={inProgress || !value}
		>Check sentiment</button
	>
{/if}
