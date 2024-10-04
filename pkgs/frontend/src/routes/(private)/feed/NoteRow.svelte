<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { InferredFeedNoteRow } from '$lib/db';
	import { ProgressRadial } from '@skeletonlabs/skeleton';
	export let note: InferredFeedNoteRow;

	function isHeaderReady(note: InferredFeedNoteRow) {
		return note?.inferred?.value || note?.inferred?.type || note?.inferred?.keywords;
	}
</script>

<div class="card m-4 p-2 relative variant-soft-secondary flex w-full h-full">
	<header class="card-header p-1">
		{#if isHeaderReady(note)}
			<div class="float-right" in:slide={{ duration: 800 }}>
				{#if note?.inferred?.keywords}
					{#each note.inferred.keywords as keyword (keyword)}
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
		{#if note?.inferred?.value}
			{note.inferred.value}
		{:else}
			{note.content}
		{/if}
	</section>
	<footer class="card-footer p-1 mt-auto text-right">
		{#if note?.inferred?.type}
			<span class="m-0 chip variant-glass-success text-xs p-0.5">{note.inferred.type}</span>
		{/if}
	</footer>
</div>
