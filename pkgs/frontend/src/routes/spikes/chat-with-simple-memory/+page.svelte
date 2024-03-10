<script lang="ts">
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { RemoteChatOpenAI } from '$lib/remoteRunnables';
	import Prompt from '$components/Prompt.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import Debug from '$components/Debug.svelte';
	import { createChatWithHistoryRunner } from '$lib/runnableStore';
	import { RunnableSequence } from '@langchain/core/runnables';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	import { writable } from 'svelte/store';
	const temp = writable('');

	const chain = RunnableSequence.from([
		ChatPromptTemplate.fromMessages([
			['system', "You're an assistant who's good at answering questions."],
			new MessagesPlaceholder('history'),
			['human', '{input}']
		]),
		RemoteChatOpenAI(session, { timeout: 30000 }),
		(input) => {
			temp.set(input);
			return input;
		}
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
		<Debug value={$temp} />
	</div>

	<BaseMessageList messagesStore={history} />
</div>
