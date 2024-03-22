<script lang="ts">
	import { RunnableSequence } from '@langchain/core/runnables';
	import { createChatWithHistoryRunner } from '$lib/runnableStore';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import ChatLayout from '$components/ChatLayout.svelte';
	import Prompt from '$components/Prompt.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { createProxiedChatModel } from '$lib/ProxiedChatOpenAI';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{input}']
	]);
	const model = createProxiedChatModel('ChatOpenAI', session);
	const runnable = RunnableSequence.from([
		{ input: (input) => input, history: () => $history },
		prompt,
		model
	]);

	const { runChain, history, inProgress } = createChatWithHistoryRunner(runnable);

	let currentMessage = '';
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<BaseMessageList messagesStore={history} />
	</svelte:fragment>
	<svelte:fragment slot="prompt">
		<Prompt
			bind:value={currentMessage}
			on:submit={() => runChain(currentMessage)}
			label="Send"
			placeholder="Ask a question"
			inProgress={$inProgress}
		/>
	</svelte:fragment>
</ChatLayout>
