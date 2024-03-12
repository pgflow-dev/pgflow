<script lang="ts">
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { RemoteModel } from '$lib/remoteRunnables';
	import Prompt from '$components/Prompt.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import Debug from '$components/Debug.svelte';
	import { createChatWithHistoryRunner } from '$lib/runnableStore';
	import { RunnableSequence } from '@langchain/core/runnables';
	import { StringOutputParser } from '@langchain/core/output_parsers';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	import { writable } from 'svelte/store';
	const temp = writable('');

	const model = RemoteModel('ChatGroq/mixtral-8x7b', session, { timeout: 30000 });

	const chain = RunnableSequence.from([
		ChatPromptTemplate.fromMessages([
			['system', "You're an assistant who's good at answering questions."],
			new MessagesPlaceholder('history'),
			['human', '{input}']
		]),
		model,
		(input) => {
			temp.set(input);
			return input;
		},
		new StringOutputParser()
	]);

	const { runChain, inProgress, history } = createChatWithHistoryRunner(chain);

	let currentMessage: string = '';
</script>

<div class="flex justify-center items-center flex-col">
	<div class="mx-auto w-3/4 pb-8">
		<Prompt
			bind:value={currentMessage}
			inProgress={$inProgress}
			on:submit={() => runChain(currentMessage)}
			label="Send"
			placeholder="Ask a question"
		/>
		<Debug label="Debug temp=" value={$temp} />
	</div>

	<BaseMessageList messagesStore={history} />
</div>
