<script lang="ts">
	// import { StringOutputParser } from '@langchain/core/output_parsers';
	import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
	import { CustomChatMessageHistory } from '$lib/customChatMessageHistory';
	// import { onMount } from 'svelte';
	import ChatMessageList from '$components/ChatMessageList.svelte';
	// import type { BaseMessage } from '@langchain/core/messages';
	// import { writable } from 'svelte/store';
	import Prompt from '$components/Prompt.svelte';
	// import { createSupabaseRunner } from '$lib/supabaseChatRunner';
	import { RunnableWithMessageHistory } from '@langchain/core/runnables';
	import { RemoteModel } from '$lib/remoteRunnables';
	// import type { RemoteModelId } from '$lib/remoteRunnables';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

	export let data;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = 'f4b105bc-ca88-45b5-b90c-ce22f8ebaab7';

	import { ChatMessageHistory } from '@langchain/community/stores/message/in_memory';

	function getMessageHistory(sessionId: string): BaseListChatMessageHistory {
		console.log('supabase-memory:getMessageHistory', { sessionId });
		// return new ChatMessageHistory();
		return new SupabaseChatMessageHistory({
			conversationId: sessionId,
			supabase,
			session
		});
	}

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{input}']
	]);
	const model = RemoteModel('ChatOpenAI', session, { timeout: 30000 });
	const runnableSession = new RunnableWithMessageHistory({
		runnable: prompt.pipe(model),
		getMessageHistory,
		inputMessagesKey: 'input',
		historyMessagesKey: 'history',
		config: { configurable: { sessionId: {} } }
	});

	// (async () => {
	// 	let results = await runnableSession.stream({ input: 'hello' });
	// 	console.log('results', results);
	// })();

	let currentMessage = '';
	import { createChatRunner } from '$lib/chatRunners';
	const { sendMessage, inProgress, chunks } = createChatRunner(runnableSession, {
		sessionId: conversationId
	});

	function onSubmit() {
		sendMessage({ input: currentMessage });
		currentMessage = '';
	}
</script>

<div class="grid grid-cols-1 grid-rows-2">
	<Prompt
		bind:value={currentMessage}
		on:submit={onSubmit}
		label="Send"
		placeholder="Ask a question"
		inProgress={$inProgress}
	/>

	<div class="card">
		{JSON.stringify($chunks, null, 2)}
	</div>

	<div class="card">
		<!-- <ChatMessageList messagesStore={chatHistory.messagesStore} /> -->
	</div>
</div>
