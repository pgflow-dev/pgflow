<script lang="ts">
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
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
	const chatHistory = new SupabaseChatMessageHistory({
		conversationId,
		supabase,
		session
	});

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{input}']
	]);
	const model = RemoteModel('ChatOpenAI', session, { timeout: 30000 });
	console.log('pre');
	const runnableSession = new RunnableWithMessageHistory({
		runnable: prompt.pipe(model),
		getMessageHistory: () => chatHistory,
		inputMessagesKey: 'history'
	});
	console.log('withListeners', runnableSession.withListeners);
	// const runnableSession = runnable.bind({ configurable: { conversationId } });
	// console.log('runnable', runnableSession);
	// import { StringOutputParser } from '@langchain/core/output_parsers';

	let currentMessage = '';
	import { createChatRunner } from '$lib/chatRunners';
	const { sendMessage, inProgress, chunks } = createChatRunner(runnableSession, {
		sessionId: conversationId
	});

	function onSubmit() {
		sendMessage(currentMessage);
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
		<ChatMessageList messagesStore={chatHistory.messagesStore} />
	</div>
</div>
