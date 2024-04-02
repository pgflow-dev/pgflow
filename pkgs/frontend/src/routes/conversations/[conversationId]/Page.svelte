<script lang="ts">
	import ChatLayout from '$components/ChatLayout.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { createProxiedChatModel } from '$lib/models/ProxiedChatOpenAI';
	import { createChainWithHistory } from '$lib/chains/createChainWithHistory';
	import { useChat } from '$lib/useChat';
	import Prompt from '$components/Prompt.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	let { session, history } = data;
	$: ({ session, history } = data);

	const prompt = ChatPromptTemplate.fromTemplate('{input}');
	const model = createProxiedChatModel('ChatOpenAI', session);
	const chain = createChainWithHistory({ prompt, model, history });

	const { input, handleSubmit, inProgress, messages } = useChat({ history, chain });
</script>

<ChatLayout>
	<svelte:fragment slot="messages" let:scrollToBottom>
		<BaseMessageList messagesStore={messages} {scrollToBottom} />
	</svelte:fragment>

	<div slot="prompt" class="flex justify-center p-4">
		<Prompt
			bind:value={$input}
			on:submit={handleSubmit}
			label="Send"
			placeholder="Ask a question"
			inProgress={$inProgress}
		/>
	</div>
</ChatLayout>
