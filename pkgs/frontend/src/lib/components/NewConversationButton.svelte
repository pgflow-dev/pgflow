<script lang="ts">
	import type { ChatConversation } from '$lib/db';
	import { goto } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';

	export let supabase: SupabaseClient;

	async function createConversationAndGoto() {
		const { data, error } = await supabase
			.schema('chat')
			.from('conversations')
			.insert({ title: 'blank' })
			.select()
			.returns<ChatConversation>()
			.single();

		if (error) {
			throw error;
		}

		if (data) {
			const conversation: ChatConversation = data;

			goto(`/conversations/${conversation.id}`);
		}
	}
</script>

<button on:click={createConversationAndGoto} class="btn btn-sm text-xs variant-filled-primary">
	+ New conversation
</button>
