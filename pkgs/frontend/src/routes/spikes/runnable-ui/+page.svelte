<script lang="ts">
	import { RunnableSequence } from '@langchain/core/runnables';
	import { RemoteChatOpenAI } from '$lib/remoteRunnables';
	import { createChatRunner } from '$lib/runnableStore';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{input}']
	]);
	const model = RemoteChatOpenAI(session, { timeout: 30000 });
	const runnable = RunnableSequence.from([
		{ input: (input) => input, history: () => ['aaa', 'bbb', 'ccc'] },
		prompt,
		model
	]);

	const { runChain, response, inProgress } = createChatRunner(runnable);
</script>

<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
	<div class="card">
		<button on:click={() => runChain('hello')}>Run</button>
		{#if $inProgress}***{/if}
	</div>

	<div class="card">
		<h3 class="h3">Response:</h3>
		<p>{$response}</p>
	</div>
</div>
