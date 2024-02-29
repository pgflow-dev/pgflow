<script lang="ts">
	// import ChatPage from '$lib/components/ChatPage.svelte';
	// import type { ChatMessage } from '$lib/chatTypes';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { RemoteChatOpenAI } from '$lib/remoteRunnables';
	// import { HumanMessage, AIMessage } from '@langchain/core/messages';
	import { ChatMessageHistory } from '@langchain/community/stores/message/in_memory';
	import { RunnableWithMessageHistory } from '@langchain/core/runnables';
	import Prompt from '$lib/components/Prompt.svelte';

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{question}']
	]);
	const model = RemoteChatOpenAI();
	const chain = prompt.pipe(model);

	const chatMessageHistory = new ChatMessageHistory();
	const chainWithHistory = new RunnableWithMessageHistory({
		runnable: chain,
		getMessageHistory: (sessionId) => {
			console.log('sessionId', sessionId);
			return chatMessageHistory;
		},
		inputMessagesKey: 'question',
		historyMessagesKey: 'history'
	});

	let currentMessage: string = '';
	// let messages: ChatMessage[] = [];

	let output = '';
	let inProgress = false;

	async function invokeChain() {
		inProgress = true;
		output = (await chainWithHistory.invoke(
			{ question: currentMessage },
			{ configurable: { sessionId: 'test' } }
		)) as string;
		currentMessage = '';
		inProgress = false;
	}
</script>

<div class="flex justify-center items-center flex-col">
	<div class="mx-auto w-3/4">
		<Prompt
			bind:value={currentMessage}
			bind:inProgress
			on:submit={invokeChain}
			label="Send"
			placeholder="Ask a question"
		/>
	</div>

	<div class="w-3/4 h-full">
		{#if output}
			<pre class="whitespace-pre-wrap break-words">{JSON.stringify(output, null, 2)}</pre>
		{/if}
	</div>
</div>
