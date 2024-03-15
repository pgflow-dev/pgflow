<script lang="ts">
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
	import Prompt from '$components/Prompt.svelte';
	import ChatMessageList from '$components/ChatMessageList.svelte';
	import { RunnableWithMessageHistory } from '@langchain/core/runnables';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { createChatRunner } from '$lib/chatRunners';

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
		runnable: prompt.pipe(model),
		getMessageHistory: () => chatHistory,
		inputMessagesKey: 'input',
		historyMessagesKey: 'history',
		config: { configurable: { sessionId: conversationId } }
	});

	let currentMessage = '';
	const { sendMessage, inProgress, chunks } = createChatRunner(runnableSession);

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
		<ChatMessageList messagesStore={chatHistory.messagesStore} />
	</div>
</div>
