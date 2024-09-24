<script lang="ts">
	import type { InferredFeedNoteRow } from '$lib/db';
	import { writable } from 'svelte/store';
	import NoteRow from '../NoteRow.svelte';
	import { onMount } from 'svelte';

	export let data;

	let { supabase } = data;
	$: ({ supabase } = data);

	const notes = writable<InferredFeedNoteRow[]>([]);
	const newContent = writable<string>('');

	function handleUpdateNote(payload: { new: InferredFeedNoteRow }) {
		console.log('handleUpdateNote', payload);

		const { new: note } = payload;
		const index = $notes.findIndex((n) => n.id === note.id);

		// if there is note in $notes with same id, replace its attributes
		if (index !== -1) {
			$notes = [
				...$notes.slice(0, index),
				{ ...$notes[index], ...note },
				...$notes.slice(index + 1)
			];
		} else {
			$notes = [note, ...$notes];
		}
	}

	async function createNote() {
		const result = await supabase.schema('feed').from('notes').insert({ content: $newContent });

		if (result.error) {
			throw result.error;
		}

		return result.data;
	}

	onMount(async () => {
		const eventSpec = {
			schema: 'feed',
			table: 'notes'
		};

		supabase
			.channel('schema-db-changes')
			.on('postgres_changes', { event: '*', ...eventSpec }, (p) => {
				console.log('PAYLOAD --------------->', p);
			})
			.on('postgres_changes', { event: 'INSERT', ...eventSpec }, handleUpdateNote)
			.on('postgres_changes', { event: 'UPDATE', ...eventSpec }, handleUpdateNote)
			.subscribe();

		const response = await supabase
			.schema('feed')
			.from('notes')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(25);

		if (response.data && !response.error) {
			notes.set(response.data);
		} else {
			console.log('error', response.error);
		}
	});
</script>

<!-- <div class=""> -->
<div class="col-start-2 col-span-6 p-4">
	<textarea bind:value={$newContent} class="textarea" />
	<button on:click={createNote} class="btn btn-xl variant-filled-primary">Add Note</button>
</div>
<div class="col-span-12 p-4">
	{#each $notes as note (note.id)}
		<NoteRow {note} />
	{/each}
</div>
