<script lang="ts">
	import RealtimeFeed from './RealtimeFeed.svelte';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	let input: string = '';
	let saving = false;
	let saveStatus: 'idle' | 'success' | 'error' = 'idle';

	async function saveNote() {
		saving = true;
		saveStatus = 'idle';

		try {
			// Insert the note with an empty embedding array
			const { error } = await supabase.schema('feed').from('notes').insert({ content: input });

			if (error) throw error;

			saveStatus = 'success';
			input = ''; // Clear the input after successful save
		} catch (error) {
			console.error('Error saving note:', error);
			saveStatus = 'error';
			if (error instanceof Error) {
				console.error('Error details:', error.message);
			}
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col space-y-4">
	<input
		type="text"
		bind:value={input}
		class="bg-white p-1 focus:outline-none"
		placeholder="Enter your note"
	/>

	<button on:click={saveNote} disabled={saving || !input.trim()} class="btn variant-filled-primary">
		{saving ? 'Saving...' : 'Save Note'}
	</button>

	{#if saveStatus === 'success'}
		<p class="text-green-500">Note saved successfully!</p>
	{:else if saveStatus === 'error'}
		<p class="text-red-500">Error saving note. Please try again.</p>
	{/if}

	<RealtimeFeed {supabase} />
</div>
