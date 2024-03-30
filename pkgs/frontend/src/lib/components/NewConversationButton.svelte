<script lang="ts">
	import type { ChatConversation } from '$lib/db';
	import { goto } from '$app/navigation';
	import { supabase, session } from '$lib/stores/current';

	async function createConversationAndGoto() {
		if (!$supabase) {
			throw 'Supabase client is not ready yet! This should not be called';
		}

		const { data, error } = await $supabase
			.schema('chat')
			.from('conversations')
			.insert({ title: 'blank' })
			.select()
			.returns<ChatConversation[]>()
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

{#if $session}
	<button on:click={createConversationAndGoto} class="btn btn-sm text-xs variant-filled-primary">
		+ New conversation
	</button>
{/if}
