<script lang="ts">
	import Prompt from '$components/Prompt.svelte';
	import type { FeedNoteRow } from '$lib/db';
	import { writable } from 'svelte/store';
	// this is doc semantic search with prompt/input on top, list on full screen, filters in right sidebar
	// filters is 1/8

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	const searchTerm = writable('');
	const notes = writable<FeedNoteRow[]>([]);

	async function fetchRelevantNotes() {
		const response = await supabase.schema('feed').rpc('easy_match_notes', {
			query: $searchTerm,
			threshold: 0.2
		});

		if (response.error) {
			throw response.error;
		}

		const data = response?.data || [];

		notes.set(data);
	}
</script>

<div class="grid grid-cols-8 gap-4">
	<div class="col-span-8 flex margin-">
		<Prompt
			value={$searchTerm}
			label="search"
			placeholder="search for notes"
			on:submit={fetchRelevantNotes}
		/>
	</div>

	<div class="col-span-7 flex">
		{#each $notes as note (note)}
			<div class="card variant-filled-surface p-3 my-3 items-center space-x-4">
				<a class="flex-grow" href="/feed/notes/{note.id}">{note.content}</a>
			</div>
		{/each}
	</div>

	<div class="col-span-1 flex">filter</div>
</div>
