<script lang="ts">
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
	import type { ChatMessage } from '$lib/supabaseChatMessageHistory';
	import ChatLayout from '$components/ChatLayout.svelte';
	import Prompt from '$components/Prompt.svelte';
	import ChatMessageList from '$components/ChatMessageList.svelte';
	// import Debug from '$components/Debug.svelte';
	import { RunnableWithMessageHistory } from '@langchain/core/runnables';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { createChatRunner } from '$lib/chatRunners';
	// import { debug } from '$lib/runnables';

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
	import { RemoteModel } from '$lib/remoteRunnables';
	const model = RemoteModel('ChatOpenAI', session, { timeout: 30000 });
	// import { ChatOpenAI } from '@langchain/openai';
	// import { PUBLIC_OPENAI_API_KEY } from '$env/static/public';
	// const model = new ChatOpenAI({ openAIApiKey: PUBLIC_OPENAI_API_KEY });
	const runnableSession = new RunnableWithMessageHistory({
		runnable: prompt.pipe(model),
		getMessageHistory: () => chatHistory,
		inputMessagesKey: 'input',
		historyMessagesKey: 'history',
		config: { configurable: { sessionId: conversationId } }
	});

	let currentMessage = '';
	const { sendMessage, inProgress, chunks } = createChatRunner(runnableSession);

	import { derived, writable } from 'svelte/store';
	const currentContent = writable('');
	import { mapStoredMessagesToChatMessages } from '$lib/supabaseChatMessageHistory';
	const simplifiedHistory = derived(
		[chatHistory.messagesStore, inProgress, chunks, currentContent],
		([$messages, $inProgress, $chunks, $currentContent]) => {
			if ($inProgress) {
				// console.log('$currentContent', $currentContent);
				const humanMessage = <ChatMessage>{
					// content: '',
					content: $currentContent,
					role: 'user',
					conversation_id: conversationId
				};
				console.log('stream', $chunks);
				// console.log('humanMessage', humanMessage);
				const streamedMessage = mapStoredMessagesToChatMessages(
					[$chunks.toDict()],
					conversationId
				)[0];

				// console.log('humanMessage', humanMessage);
				// console.log('streamedMessage', streamedMessage);

				return [...$messages, humanMessage, streamedMessage];
			} else {
				return $messages;
			}
		}
	);

	$: $simplifiedHistory && console.log('history', $simplifiedHistory);

	async function onSubmit() {
		currentContent.set(currentMessage);
		// console.log('currentMessage', currentMessage);
		await sendMessage({ input: currentMessage });
		currentContent.set('');
		currentMessage = '';
	}
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<ChatMessageList messagesStore={simplifiedHistory} />
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt
			bind:value={currentMessage}
			on:submit={onSubmit}
			label="Send"
			placeholder="Ask a question"
			inProgress={$inProgress}
		/>
	</svelte:fragment>
</ChatLayout>
