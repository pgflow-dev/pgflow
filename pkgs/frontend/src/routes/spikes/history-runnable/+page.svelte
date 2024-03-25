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
	const getMessagesPromise = history.getMessages();
	const inProgress = writable<boolean>(false);

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
		inProgress.set(true);
		await getMessagesPromise;

		const streamPromise = chain.stream({ input: userInput });
		userInput = '';
		const stream = await streamPromise;

		for await (const chunk of stream) {
			aiMessageChunk.update((c) => {
				return c ? c.concat(chunk) : chunk;
			});
		}

		const aiMessage = get(aiMessageChunk);
		if (aiMessage) {
			await history.addMessage(aiMessage);
		}

		aiMessageChunk.set(null);
		userInput = '';
		inProgress.set(false);
	}

	let clearHistoryPromise: Promise<void> | null = null;

	async function clearHistory() {
		// sets a promise and unsets on resolve
		clearHistoryPromise = history.clear().then(() => {
			clearHistoryPromise = null;
		});
	}
</script>

<ChatLayout>
	<svelte:fragment slot="messages" let:scrollToBottom>
		{#await getMessagesPromise}
			<div class="w-full h-full flex items-center justify-center">
				<h3 class="h3 text-gray-700">Loading conversation...</h3>
			</div>
		{:then}
			<BaseMessageList messagesStore={messagesWithChunk} {scrollToBottom} />
		{/await}
	</svelte:fragment>

	<div slot="prompt" class="flex justify-center">
		<Prompt
			bind:value={userInput}
			on:submit={runStream}
			label="Send"
			placeholder="Ask a question"
			inProgress={!!clearHistoryPromise}
		/>

		<button class="" disabled={$inProgress || !!clearHistoryPromise} on:click={clearHistory}>
			Clear
		</button>
	</div>
</ChatLayout>
