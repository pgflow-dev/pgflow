<script lang="ts">
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
	// import { onMount } from 'svelte';
	import ChatMessageList from '$components/ChatMessageList.svelte';
	// import type { BaseMessage } from '@langchain/core/messages';
	// import { writable } from 'svelte/store';
	// import Prompt from '$components/Prompt.svelte';
	// import { createSupabaseRunner } from '$lib/supabaseChatRunner';

	export let data;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = 'f4b105bc-ca88-45b5-b90c-ce22f8ebaab7';
	const chatHistory = new SupabaseChatMessageHistory({
		conversationId,
		supabase,
		session
	});

	// const { runChain, inProgress } = createChatRunner(runnable, chatHistory);
</script>

<div class="grid grid-cols-1 grid-rows-2 md:grid-cols-3 gap-4">
	<!-- <div class="card col-start-2 row-start-2"> -->
	<!-- 	<Prompt -->
	<!-- 		bind:value={currentMessage} -->
	<!-- 		on:submit={() => runChain(currentMessage)} -->
	<!-- 		label="Send" -->
	<!-- 		placeholder="Ask a question" -->
	<!-- 		inProgress={$inProgress} -->
	<!-- 	/> -->
	<!-- </div> -->

	<div class="card">
		<ChatMessageList messagesStore={chatHistory.messagesStore} />
	</div>
</div>
