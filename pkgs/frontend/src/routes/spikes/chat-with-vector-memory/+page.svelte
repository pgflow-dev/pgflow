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
	// import { StringOutputParser } from '@langchain/core/output_parsers';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{query}']
	]);
	const model = RemoteChatOpenAI(session, { timeout: 30000 });

	const remoteEmbeddings = new RemoteEmbeddings({}, session);
	const vectorStore = new MemoryVectorStore(remoteEmbeddings);
	const memory = new VectorStoreRetrieverMemory({
		vectorStoreRetriever: vectorStore.asRetriever(),
		inputKey: 'query',
		outputKey: 'output',
		memoryKey: 'history'
	});

	// const vectorQueriesPrompt = ChatPromptTemplate.fromMessages([
	// 	[
	// 		'system',
	// 		"You're an assistant who's good at creating queries to the vector store and increase the hit ratio for good context. You must create a query that will best emulate potential content that could be relevant to the user query. create 5 queries, separated by newlines. do not mention context, but make sure it is relevant."
	// 	],
	// 	['human', '{query}']
	// ]);
	// const vectorQueriesChain = vectorQueriesPrompt
	// 	.pipe(model)
	// 	.pipe(new StringOutputParser())
	// 	.pipe((lines) => lines.split('\n'));

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
