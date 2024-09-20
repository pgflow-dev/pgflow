<script lang="ts">
	import Prompt from '$components/Prompt.svelte';
	import type { FeedNoteRow } from '$lib/db';
	import { writable } from 'svelte/store';
	import { fly, fade } from 'svelte/transition';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	const searchTerm = writable('');
	const notes = writable<FeedNoteRow[]>([]);
	let showResults = false;
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
		showResults = true;
	}
</script>

<div class="container mx-auto px-4 h-screen flex flex-col">
	<div class="flex-grow flex items-center justify-center" class:hidden={showResults}>
		<div class="w-1/2">
			<Prompt
				value={$searchTerm}
				label="search"
				placeholder="search for notes"
				on:submit={fetchRelevantNotes}
			/>
		</div>
	</div>

	{#if showResults}
		<div class="grid grid-cols-12 gap-4">
			<div
				class="col-span-6 col-start-4 flex mb-4 pt-10 pb-4"
				in:fly={{ y: 500, duration: 100 }}
				out:fade
			>
				<Prompt
					value={$searchTerm}
					label="search"
					placeholder="search for notes"
					on:submit={fetchRelevantNotes}
				/>
			</div>

			<div class="col-span-10 col-start-2" in:fade={{ duration: 100, delay: 0 }}>
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
	{/if}
</div>
