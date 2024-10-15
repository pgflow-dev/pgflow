<script lang="ts">
	export let text: string;
	export let loading: boolean = false;
</script>

<div
	class="overflow-x-auto card break-inside-avoid p-2 variant-soft-secondary relative border border-gray-800"
>
	<span>{text}</span>

	{#if loading}
		<span>⌛</span>
	{/if}
</div>
