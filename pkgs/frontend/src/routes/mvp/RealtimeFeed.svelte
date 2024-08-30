<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
	import type { FeedNoteRow } from '$lib/db';

	export let supabase: SupabaseClient;

	let notes: FeedNoteRow[] = [];
	let channel: RealtimeChannel;

	onMount(async () => {
		console.log('fetching last 10 notes...');
		const notesResponse = await supabase
			.schema('feed')
			.from('notes')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(10)
			.returns<FeedNoteRow[]>();

		if (notesResponse.data) {
			console.log(' -> got notes: ', notesResponse.data);
			notes = <FeedNoteRow[]>notesResponse.data;
		}

		console.log('setting up realtime channel for notes inserts...');
		channel = supabase
			.channel('schema-db-changes')
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'feed',
					table: 'notes'
				},
				(payload) => {
					console.log(' -> realtime event: ', payload);
					if (payload.new) {
						notes = [payload.new as FeedNoteRow, ...notes];
					}
				}
			)
			.subscribe();
	});

	onDestroy(() => {
		if (channel) {
			channel.unsubscribe();
		}
	});
</script>

<ul class="list">
	{#each notes as note (note.id)}
		<li>
			<pre>({note.id})</pre>
			<span class="bg-black flex-auto">{note.content}</span>
		</li>
	{/each}
	<!-- ... -->
</ul>
<ul></ul>
