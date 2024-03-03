<script lang="ts">
	// import ChatPage from '$components/ChatPage.svelte';
	// import type { BaseMessage } from '$lib/chatTypes';
	import type { StoredMessage } from '@langchain/core/messages';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { RemoteChatOpenAI } from '$lib/remoteRunnables';
	// import { ChatMessageHistory } from '@langchain/community/stores/message/in_memory';
	// import { RunnableWithMessageHistory } from '@langchain/core/runnables';
	import Prompt from '$components/Prompt.svelte';
	// import Debug from '$components/Debug.svelte';
	import { MemoryVectorStore } from 'langchain/vectorstores/memory';
	import { VectorStoreRetrieverMemory } from 'langchain/memory';
	import { RunnableSequence } from '@langchain/core/runnables';
	import { RemoteEmbeddings } from '$lib/remoteEmbeddings';

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{query}']
	]);
	const model = RemoteChatOpenAI();

	const remoteEmbeddings = new RemoteEmbeddings({});
	const vectorStore = new MemoryVectorStore(remoteEmbeddings);
	const memory = new VectorStoreRetrieverMemory({
		vectorStoreRetriever: vectorStore.asRetriever(),
		inputKey: 'query',
		outputKey: 'output',
		memoryKey: 'history'
	});

	const chain = RunnableSequence.from([
		{
			input: (initialInput) => initialInput.query,
			memory: (initialInput) => {
				console.log('initialInput', initialInput);
				return memory.loadMemoryVariables({ query: initialInput.query });
			}
		},
		{
			query: (previousOutput) => previousOutput.input,
			history: (previousOutput) => {
				console.log('previousOutput', previousOutput);
				return previousOutput.memory.history || [];
			}
		},
		prompt,
		model
	]);

	let currentMessage: string = '';
	let messages: StoredMessage[] = [];

	let output = '';
	let inProgress = false;

	async function invokeChain() {
		inProgress = true;

		output = (await chain.invoke({ query: currentMessage })) as string;
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
