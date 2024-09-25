<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { InferredFeedNoteRow } from '$lib/db';
	import { ProgressRadial } from '@skeletonlabs/skeleton';
	export let note: InferredFeedNoteRow;

	function isHeaderReady(note: InferredFeedNoteRow) {
		return note?.inferred?.value || note?.inferred?.type || note?.inferred?.keywords;
	}
</script>

<div class="card mb-4 relative">
	<header class="card-header">
		{#if isHeaderReady(note)}
			{#if note?.inferred?.type}
				<span class="chip variant-filled-error p-2">{note.inferred.type}</span>
			{/if}

			{#if note?.embedding}
				<span class="badge variant-filled float-right ml-2" in:slide={{ duration: 500 }}>i</span>
			{/if}

			<div class="float-right" in:slide={{ duration: 800 }}>
				{#if note?.inferred?.keywords}
					{#each note.inferred.keywords as keyword (keyword)}
						<span class="badge">{keyword}</span>
					{/each}
				{/if}
			</div>
		{:else}
			<div class="float-right">
				<ProgressRadial width="w-8" stroke={20} />
			</div>
		{/if}
	</header>
	<section class="p-4">
		{#if note?.inferred?.value}
			{note.inferred.value}
		{:else}
			{note.content}
		{/if}
	</section>
</div>
