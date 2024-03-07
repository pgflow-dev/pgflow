<script lang="ts">
	// import ChatPage from '$components/ChatPage.svelte';
	// import type { BaseMessage } from '$lib/chatTypes';
	import type { StoredMessage } from '@langchain/core/messages';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { RemoteChatOpenAI } from '$lib/remoteRunnables';
	import { ChatMessageHistory } from '@langchain/community/stores/message/in_memory';
	import { RunnableWithMessageHistory } from '@langchain/core/runnables';
	import Prompt from '$components/Prompt.svelte';
	// import Debug from '$components/Debug.svelte';

	import type { PageData } from './$types';
	export let data: PageData;
	let {
		session: { access_token: authToken }
	} = data;
	$: ({
		session: { access_token: authToken }
	} = data);

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{question}']
	]);
	const model = RemoteChatOpenAI(authToken, { timeout: 30000 });
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
	let messages: StoredMessage[] = [];

	let output = '';
	let inProgress = false;

	async function invokeChain() {
		inProgress = true;
		output = (await chainWithHistory.invoke(
			{ question: currentMessage },
			{ configurable: { sessionId: 'test' } }
		)) as string;
		messages = (await chatMessageHistory.getMessages()).map((m) => {
			return m.toDict();
		});
		console.log('output', output);
		currentMessage = '';
		inProgress = false;
	}
</script>

<div class="flex justify-center items-center flex-col">
	<div class="mx-auto w-3/4 pb-8">
		<Prompt
			bind:value={currentMessage}
			bind:inProgress
			on:submit={invokeChain}
			label="Send"
			placeholder="Ask a question"
		/>
	</div>

	<div class="grid grid-cols-[auto_1fr] gap-2 w-full md:w-3/4">
		{#each messages as message}
			<div class="font-bold">{message.type.toUpperCase()}:</div>
			<div class="">{message.data.content}</div>
		{/each}
	</div>
</div>
