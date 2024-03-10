<script lang="ts">
	import { RunnableSequence } from '@langchain/core/runnables';
	import { RemoteChatOpenAI } from '$lib/remoteRunnables';
	import { createChatWithHistoryRunner } from '$lib/runnableStore';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import Prompt from '$components/Prompt.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';

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
		{ input: (input) => input, history: () => $history },
		prompt,
		model
	]);

	const { runChain, history, inProgress } = createChatWithHistoryRunner(runnable);

	let currentMessage = '';
</script>

<div class="grid grid-cols-1 grid-rows-2 md:grid-cols-3 gap-4">
	<div class="card col-start-2 row-start-2">
		<Prompt
			bind:value={currentMessage}
			on:submit={() => runChain(currentMessage)}
			label="Send"
			placeholder="Ask a question"
			inProgress={$inProgress}
		/>
	</div>
</div>

<BaseMessageList messagesStore={history} />
