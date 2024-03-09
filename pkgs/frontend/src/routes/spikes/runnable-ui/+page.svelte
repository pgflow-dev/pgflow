<script lang="ts">
	import { RunnableSequence } from '@langchain/core/runnables';
	import { RemoteChatOpenAI } from '$lib/remoteRunnables';
	import { createChatRunner } from '$lib/runnableStore';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import Prompt from '$components/Prompt.svelte';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	const history = <BaseMessage[]>[
		new SystemMessage('You are helpful assistant'),
		new HumanMessage('Who won the world series in 2020?')
	];

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{input}']
	]);
	const model = RemoteChatOpenAI(session, { timeout: 30000 });
	const runnable = RunnableSequence.from([
		{ input: (input) => input, history: () => history },
		prompt,
		model,
		new StringOutputParser()
	]);

	const { runChain, response, inProgress } = createChatRunner(runnable);

	let currentMessage = '';
</script>

<div class="grid grid-cols-1 grid-rows-2 md:grid-cols-3 gap-4">
	<div class="card col-start-2 row-start-2">
		<Prompt
			bind:value={currentMessage}
			on:submit={() => runChain(currentMessage)}
			label="Send"
			placeholder="Ask a question"
			bind:inProgress={$inProgress}
		/>
	</div>

	{#if $response}
		<div class="card col-start-2 row-start-3">
			<p>{$response}</p>
		</div>
	{/if}
</div>
