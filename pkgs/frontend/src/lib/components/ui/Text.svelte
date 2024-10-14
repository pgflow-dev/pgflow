<script lang="ts">
	export let text: string;
	export let loading: boolean = false;

	import { ProgressRadial } from '@skeletonlabs/skeleton';
</script>

<div class="card break-inside-avoid p-4 variant-soft-tertiary flex items-center justify-between">
	<span>{text}</span>

	{#if loading}
		<ProgressRadial width="w-5" stroke={30} class="mt-1 ml-2" />
	{/if}
</div>
