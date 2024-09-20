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
			match_threshold: 0.2
		});

		if (response.error) {
			throw response.error;
		}

		const data = response?.data || [];

		notes.set(data);
	}
</script>

<div class="container mx-auto px-4">
	<div class="grid grid-cols-12 gap-4">
		<div class="col-span-6 col-start-4 flex mb-4 pt-10 pb-4">
			<Prompt
				value={$searchTerm}
				label="search"
				placeholder="search for notes"
				on:submit={fetchRelevantNotes}
			/>
		</div>

		<div class="col-span-10 col-start-2">
			{#each $notes as note (note)}
				<div class="card mb-4">
					<header class="card-header">
						<a class="flex-grow" href="/feed/notes/{note.id}">{note.id}</a>
					</header>
					<section class="p-4">{note.content}</section>
				</div>
			{/each}
		</div>
	</div>
</div>
