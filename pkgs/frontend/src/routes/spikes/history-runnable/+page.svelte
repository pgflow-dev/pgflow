<script lang="ts">
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { createProxiedChatModel } from '$lib/ProxiedChatOpenAI';
	// import { ChatMessageHistoryStore } from '$lib/ChatMessageHistoryStore';
	// import Debug from '$components/Debug.svelte';
	import Prompt from '$components/Prompt.svelte';
	import ChatLayout from '$components/ChatLayout.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { createChainWithHistory } from '$lib/chains/createChainWithHistory';
	import { writable, derived, get } from 'svelte/store';
	import { AIMessageChunk } from '@langchain/core/messages';
	import {
		SupabaseChatMessageHistory,
		chatMessageToBaseMessage
	} from '$lib/supabaseChatMessageHistory';

	export let data;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = 'f4b105bc-ca88-45b5-b90c-ce22f8ebaab7';
	const history = new SupabaseChatMessageHistory({ supabase, conversationId });
	history.clear();

	const aiMessageChunk = writable<AIMessageChunk | null>(null);
	const baseMessages = derived(history.messagesStore, ($messages) => {
		return $messages.map(chatMessageToBaseMessage);
	});

	const messagesWithChunk = derived(
		[baseMessages, aiMessageChunk],
		([$messages, $aiMessageChunk]) => {
			if ($aiMessageChunk) {
				$messages = [...$messages, $aiMessageChunk];
			}
			return $messages;
		}
	);

	const prompt = ChatPromptTemplate.fromTemplate('{input}');
	const model = createProxiedChatModel('ChatOpenAI', session);

	const chain = createChainWithHistory({ prompt, model, history });

	let userInput = '';

	async function runStream() {
		const stream = await chain.stream({ input: userInput });

		for await (const chunk of stream) {
			aiMessageChunk.update((c) => {
				return c ? c.concat(chunk) : chunk;
			});
		}

		const aiMessage = get(aiMessageChunk);
		if (aiMessage) {
			console.log('PRE');
			await history.addMessage(aiMessage);
			console.log('POST');
		}

		aiMessageChunk.set(null);
		userInput = '';
	}
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<BaseMessageList messagesStore={messagesWithChunk} />
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt
			bind:value={userInput}
			on:submit={runStream}
			label="Send"
			placeholder="Ask a question"
		/>
	</svelte:fragment>
</ChatLayout>
