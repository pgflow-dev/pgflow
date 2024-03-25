<script lang="ts">
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import ChatLayout from '$components/ChatLayout.svelte';
	import Prompt from '$components/Prompt.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { createChatWithHistoryRunner } from '$lib/runnableStore';
	import { RunnableSequence } from '@langchain/core/runnables';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import { createProxiedChatModel } from '$lib/ProxiedChatOpenAI';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	const prompt = ChatPromptTemplate.fromMessages([
		['system', "You're an assistant who's good at answering questions."],
		new MessagesPlaceholder('history'),
		['human', '{input}']
	]);

	function initChain() {
		let model = createProxiedChatModel('ChatOpenAI', session);
		let chain = RunnableSequence.from([prompt, model, new StringOutputParser()]);

		return createChatWithHistoryRunner(chain);
	}

	let { runChain, inProgress, history } = initChain();
	$: ({ runChain, inProgress, history } = initChain());

	let currentMessage: string = '';
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<BaseMessageList messagesStore={history} />
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt
			bind:value={currentMessage}
			inProgress={$inProgress}
			on:submit={() => runChain(currentMessage)}
			label="Send"
			placeholder="Ask a question"
		/>
	</svelte:fragment>
</ChatLayout>
