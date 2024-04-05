<script lang="ts">
	import ChatLayout from '$components/ChatLayout.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
	import { createProxiedChatModel } from '$lib/models/ProxiedChatOpenAI';
	import { useChat } from '$lib/useChat';
	import Prompt from '$components/Prompt.svelte';
	import type { PageData } from './$types';
	import { SupabaseChatMessageHistory } from '$lib/chat_histories/SupabaseChatMessageHistory';
	import { page } from '$app/stores';
	import { RunnableSequence } from '@langchain/core/runnables';

	export let data: PageData;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = $page.params.conversationId;

	const history = new SupabaseChatMessageHistory({ supabase, session, conversationId });
	history.getMessages();

	const prompt = ChatPromptTemplate.fromMessages([
		['system', 'You are a helpful assistant.'],
		new MessagesPlaceholder('messages'),
		['user', '{input}']
	]);
	const model = createProxiedChatModel('ChatOpenAI', session);
	const chain = RunnableSequence.from([
		history.asLoaderRunnable(),
		prompt,
		history.asSaverRunnable(),
		model
	]);

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
