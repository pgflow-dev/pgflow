<script lang="ts">
	import NewConversationButton from '$components/NewConversationButton.svelte';
	import type { ChatConversation } from '$lib/db.js';
	import dayjs from 'dayjs';
	import relativeTime from 'dayjs/plugin/relativeTime';
	dayjs.extend(relativeTime);

	export let data;
	let { supabase, conversations } = data;
	$: ({ supabase, conversations } = data);

	async function deleteConversation(conversation: ChatConversation) {
		const { error } = await supabase
			.schema('chat')
			.from('conversations')
			.delete()
			.eq('id', conversation.id);

		if (error) {
			throw error;
		}

		conversations = [...conversations.filter((c) => c.id !== conversation.id)];
	}
</script>

<div class="h-full w-full md:w-3/4 mx-auto flex flex-col tems-center p-8 card">
	<h2 class="h2">My conversations</h2>

	<div class="flex flex-row items-center justify-end">
		<NewConversationButton {supabase} />
	</div>

	{#each conversations as conversation (conversation.id)}
		<div class="flex card variant-filled-surface p-3 my-3 items-center space-x-4">
			<a class="h4 flex-grow" href="/conversations/{conversation.id}">{conversation.title}</a>
			<div class="text-gray-500 text-xs">{dayjs(conversation.created_at).fromNow()}</div>
			<button on:click={() => deleteConversation(conversation)} class="chip variant-filled-error"
				>✕</button
			>
		</div>
	{/each}
</div>
