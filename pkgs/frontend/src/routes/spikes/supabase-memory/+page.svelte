<script lang="ts">
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
	import type { ChatMessage } from '$lib/supabaseChatMessageHistory';
	import Prompt from '$components/Prompt.svelte';
	import ChatMessageList from '$components/ChatMessageList.svelte';
	// import Debug from '$components/Debug.svelte';
	import { RunnableWithMessageHistory } from '@langchain/core/runnables';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { createChatRunner } from '$lib/chatRunners';
	import { debug } from '$lib/runnables';

	export let data;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = 'f4b105bc-ca88-45b5-b90c-ce22f8ebaab7';

	const chatHistory = new SupabaseChatMessageHistory({
		conversationId,
		supabase,
		session
	});
	chatHistory.clear();

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{input}']
	]);
	import { ChatOpenAI } from '@langchain/openai';
	import { PUBLIC_OPENAI_API_KEY } from '$env/static/public';
	const model = new ChatOpenAI({ openAIApiKey: PUBLIC_OPENAI_API_KEY });
	const runnableSession = new RunnableWithMessageHistory({
		runnable: prompt.pipe(debug('prompt')).pipe(model),
		getMessageHistory: () => chatHistory,
		inputMessagesKey: 'input',
		historyMessagesKey: 'history',
		config: { configurable: { sessionId: conversationId } }
	}).pipe(debug('afterhistory'));

	let currentMessage = '';
	const { sendMessage, inProgress, chunks } = createChatRunner(runnableSession);

	import { derived, writable } from 'svelte/store';
	const currentContent = writable('');
	import { mapStoredMessagesToChatMessages } from '$lib/supabaseChatMessageHistory';
	const simplifiedHistory = derived(
		[chatHistory.messagesStore, inProgress, chunks, currentContent],
		([$messages, $inProgress, $chunks, $currentContent]) => {
			if ($inProgress) {
				const humanMessage = <ChatMessage>{
					content: $currentContent,
					role: 'user',
					conversation_id: conversationId
				};
				// console.log('humanMessage', humanMessage);
				const streamedMessage = mapStoredMessagesToChatMessages(
					[$chunks.toDict()],
					conversationId
				)[0];

				return [...$messages, humanMessage, streamedMessage];
			} else {
				return $messages;
			}
		}
	);

	function onSubmit() {
		currentContent.set(currentMessage);
		sendMessage({ input: currentMessage });
		currentContent.set('');
		currentMessage = '';
	}
</script>

<div class="flex flex-col h-full">
	<Prompt
		bind:value={currentMessage}
		on:submit={onSubmit}
		label="Send"
		placeholder="Ask a question"
		inProgress={$inProgress}
	/>

	<!-- <Debug value={$simplifiedHistory} /> -->
	<!-- <div class="card"> -->
	<!-- 	{JSON.stringify($simplifiedHistory, null, 2)} -->
	<!-- </div> -->

	<div class="card">
		<ChatMessageList messagesStore={simplifiedHistory} />
	</div>
</div>
