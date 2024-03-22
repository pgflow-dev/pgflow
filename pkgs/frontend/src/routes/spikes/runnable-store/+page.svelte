<script lang="ts">
	import ChatLayout from '$components/ChatLayout.svelte';
	import ChatMessageList from '$components/ChatMessageList.svelte';
	import Prompt from '$components/Prompt.svelte';
	import { createQaChainWithHistory } from '$lib/chains/QaChain';
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
	import { BaseMessageChunk } from '@langchain/core/messages';
	import type { ChatMessage } from '$lib/supabaseChatMessageHistory';
	import Debug from '$components/Debug.svelte';

	export let data;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = 'f4b105bc-ca88-45b5-b90c-ce22f8ebaab7';

	const memory = new SupabaseChatMessageHistory({
		conversationId,
		supabase
	});
	memory.clear();

	const chain = createQaChainWithHistory({
		session,
		conversationId,
		memory
	});

	let userInput = '';

	import { writable, derived } from 'svelte/store';
	// import type { Readable } from 'svelte/store';
	const chunks = writable<BaseMessageChunk | null>(null);
	const humanMessage = writable<ChatMessage | null>(null);
	const chunkedChatMessage = derived(chunks, ($chunks) => {
		if ($chunks) {
			return <ChatMessage>{
				content: $chunks.content,
				role: 'assistant',
				conversation_id: conversationId
			};
		}

		return null;
	});

	async function runChain() {
		humanMessage.set({
			content: userInput,
			role: 'user',
			conversation_id: conversationId
		});

		const stream = await chain.stream({ input: userInput });

		for await (const chunk of stream) {
			chunks.update((prevChunk) => {
				if (prevChunk) {
					return prevChunk.concat(chunk);
				} else {
					return chunk;
				}
			});
		}

		chunks.set(null);
		humanMessage.set(null);
	}

	const msgStore = memory.messagesStore;

	console.clear();
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<ChatMessageList messagesStore={memory.messagesStore} streamStore={chunkedChatMessage} />

		<Debug label="chunkedChatMessage" value={$chunkedChatMessage} />
		<Debug label="humanMessage" value={$humanMessage} />
		<Debug label="messagesStore" value={$msgStore} />
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt
			bind:value={userInput}
			on:submit={runChain}
			inProgress={false}
			placeholder="ask a question"
			label=">"
		/>
	</svelte:fragment>
</ChatLayout>
