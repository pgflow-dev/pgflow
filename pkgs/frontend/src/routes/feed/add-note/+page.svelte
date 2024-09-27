<script lang="ts">
	import type { InferredFeedNoteRow } from '$lib/db';
	import { writable } from 'svelte/store';
	import NoteRow from '../NoteRow.svelte';
	import { onMount } from 'svelte';
	import type { RealtimePostgresDeletePayload } from '@supabase/supabase-js';
	import { enhance } from '$app/forms';

	export let data;

	let { supabase } = data;
	$: ({ supabase } = data);

	const notes = writable<InferredFeedNoteRow[]>([]);
	let textareaElement: HTMLTextAreaElement;

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

	function handleDeleteNote(payload: RealtimePostgresDeletePayload<InferredFeedNoteRow>) {
		console.log('handleDeleteNote', payload);

		const { old: deleted } = payload;
		$notes = $notes.filter((n) => n.id !== deleted.id);
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
			.on('postgres_changes', { event: 'DELETE', ...eventSpec }, handleDeleteNote)
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

		textareaElement.focus();
	});

	function handlePaste(event: KeyboardEvent) {
		if (event.ctrlKey && event.key === 'v') {
			event.preventDefault();
			navigator.clipboard.readText().then((text) => {
				textareaElement.value = text;
				if (textareaElement) {
					textareaElement.focus();
				}
			});
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.ctrlKey && event.key === 'Enter') {
			event.preventDefault();
			const target = event.target as HTMLElement;
			const form = target?.closest('form');
			if (form) {
				form.requestSubmit();
			}
		}
	}
</script>

<svelte:window on:keydown={handlePaste} />

<div class="col-start-2 col-span-6 p-4">
	<form method="POST" use:enhance>
		<textarea
			name="content"
			bind:this={textareaElement}
			class="textarea"
			on:keydown={handleKeydown}
		/>
		<button type="submit" class="btn btn-xl variant-filled-primary">Add Note</button>
	</form>
</div>
<div class="col-span-12 p-4">
	{#each $notes as note (note.id)}
		<NoteRow {note} />
	{/each}
</div>
