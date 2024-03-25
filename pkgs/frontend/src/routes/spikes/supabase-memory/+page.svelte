<script lang="ts">
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
	import ChatLayout from '$components/ChatLayout.svelte';
	import Prompt from '$components/Prompt.svelte';
	import { createChatRunner } from '$lib/chatRunners';
	import { createQaChainWithHistory } from '$lib/chains/QaChain';

	export let data;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = 'f4b105bc-ca88-45b5-b90c-ce22f8ebaab7';

	const chatHistory = new SupabaseChatMessageHistory({
		conversationId,
		supabase
	});
	chatHistory.clear();

	const runnableSession = createQaChainWithHistory({
		session,
		conversationId,
		memory: chatHistory
	});

	let currentMessage = '';
	const { sendMessage, inProgress } = createChatRunner(runnableSession);

	import { writable } from 'svelte/store';
	const currentContent = writable('');

	async function onSubmit() {
		currentContent.set(currentMessage);
		await sendMessage({ input: currentMessage });
		currentContent.set('');
		currentMessage = '';
	}
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<!-- <ChatMessageList messagesStore={simplifiedHistory} /> -->
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt
			bind:value={currentMessage}
			on:submit={onSubmit}
			label="Send"
			placeholder="Ask a question"
			inProgress={$inProgress}
		/>
	</svelte:fragment>
</ChatLayout>
