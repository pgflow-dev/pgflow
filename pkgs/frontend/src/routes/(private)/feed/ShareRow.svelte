<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { InferredFeedShareRow } from '$lib/db';
	import { ProgressRadial } from '@skeletonlabs/skeleton';
	export let share: InferredFeedShareRow;

	function isHeaderReady(share: InferredFeedShareRow) {
		return share?.inferred?.value || share?.inferred?.type || share?.inferred?.keywords;
	}
</script>

<div class="card m-4 p-2 relative variant-soft-secondary flex w-full h-full">
	<header class="card-header p-1">
		{#if isHeaderReady(share)}
			<div class="float-right" in:slide={{ duration: 800 }}>
				{#if share?.inferred?.keywords}
					{#each share.inferred.keywords as keyword (keyword)}
						<a
							href="/yolo"
							class="chip variant-glass-tertiary hover:variant-glass-primary py-0 p-0.5 mx-0.5"
							>{keyword}</a
						>
					{/each}
				{/if}
			</div>
		{:else}
			<div class="float-right">
				<ProgressRadial width="w-8" stroke={20} />
			</div>
		{/if}
	</header>
	<section class="p-4 flex-grow">
		{#if share?.inferred?.value}
			{share.inferred.value}
		{:else}
			{share.content}
		{/if}
	</section>
	<footer class="card-footer p-1 mt-auto text-right">
		{#if share?.inferred?.type}
			<span class="m-0 chip variant-glass-success text-xs p-0.5">{share.inferred.type}</span>
		{/if}
	</footer>
</div>
