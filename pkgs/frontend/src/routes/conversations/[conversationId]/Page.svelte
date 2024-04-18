<script lang="ts">
	import ChatLayout from '$components/ChatLayout.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { createProxiedChatModel } from '$lib/models/ProxiedChatOpenAI';
	import { useChat } from '$lib/useChat';
	import Prompt from '$components/Prompt.svelte';
	import type { PageData } from './$types';
	import { SupabaseChatMessageHistory } from '$lib/chat_histories/SupabaseChatMessageHistory';
	import { page } from '$app/stores';
	import { RunnableParallel, RunnableSequence } from '@langchain/core/runnables';
	import useRetriever from '$lib/useRetriever';
	import { ProgressRadial } from '@skeletonlabs/skeleton';
	import { chatWithHistoryAndContextPrompt } from '$lib/prompts';
	import { debug } from '$lib/runnables';

	export let data: PageData;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = $page.params.conversationId;

	const history = new SupabaseChatMessageHistory({ supabase, session, conversationId });
	history.getMessages();

	const {
		chain: retrievalChain,
		documents,
		loading: retrieverLoading
	} = useRetriever({ session, supabase });

	const model = createProxiedChatModel('ChatOpenAI', session);
	const chain = RunnableSequence.from([
		RunnableParallel.from({
			input: (originalInput: { input: string }) => originalInput.input,
			messages: history.asLoaderRunnable(),
			context: retrievalChain
		}),
		debug('parallel'),
		chatWithHistoryAndContextPrompt,
		history.asSaverRunnable(),
		model
	]);

	const { input, handleSubmit, loading, messages } = useChat({ history, chain });
</script>

<ChatLayout>
	<svelte:fragment slot="messages" let:scrollToBottom>
		<BaseMessageList messagesStore={messages} {scrollToBottom} />

		{#if $retrieverLoading}
			<div class="card">
				<ProgressRadial width="w-4" stroke={30} />
				<h3 class="h3">Retrieving relevant docs...</h3>
			</div>
		{/if}

		{#if $documents.length > 0}
			<div
				class="card fixed bottom-1/3 right-0 h-2/5 shadow-black w-2/5 overflow-y-auto overflow-x-hidden shadow p-4 m-8 rounded-xl z-30"
			>
				<h3 class="h3">Relevant docs:</h3>
				{#each $documents as doc (doc)}
					<p>- {doc.pageContent}</p>
				{/each}
			</div>
		{/if}
	</svelte:fragment>

	<div slot="prompt" class="flex justify-center p-4">
		<Prompt
			bind:value={$input}
			on:submit={handleSubmit}
			label="Send"
			placeholder="Ask a question"
			loading={$loading}
		/>
	</div>
</ChatLayout>
