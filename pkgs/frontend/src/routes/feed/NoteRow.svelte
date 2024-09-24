<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { InferredFeedNoteRow } from '$lib/db';
	import { ProgressRadial } from '@skeletonlabs/skeleton';
	export let note: InferredFeedNoteRow;
</script>

<div class="card mb-4 relative">
	<header class="card-header">
		{#if note?.inferred?.type}
			<span class="chip variant-filled-error p-2">{note.inferred.type}</span>
		{:else}
			<ProgressRadial width="w-4" stroke={50} />
		{/if}

		{#if note?.embedding}
			<span class="badge variant-filled float-right ml-2" in:slide={{ duration: 500 }}>i</span>
		{:else}
			<ProgressRadial width="w-4" stroke={50} />
		{/if}

		<div class="float-right" in:slide={{ duration: 800 }}>
			{#if note?.inferred?.keywords}
				{#each note.inferred.keywords as keyword (keyword)}
					<span class="badge">{keyword}</span>
				{/each}
			{:else}
				<ProgressRadial width="w-4" stroke={50} />
			{/if}
		</div>
	</header>
	<section class="p-4">
		{#if note?.inferred?.value}
			{note.inferred.value}
		{:else}
			{note.content}
		{/if}
	</section>
</div>
