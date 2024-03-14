<script lang="ts">
	import { SupabaseChatMessageHistory } from '$lib/supabaseChatMessageHistory';
	import { onMount } from 'svelte';

	export let data;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const conversationId = 'f4b105bc-ca88-45b5-b90c-ce22f8ebaab7';
	const chatHistory = new SupabaseChatMessageHistory({
		conversationId,
		supabase,
		session
	});

	async function createHistory() {
		await chatHistory.addAIMessage('how can i help you?');
		await chatHistory.addUserMessage('i need help with learning python');

		console.log('getMessages', await chatHistory.getMessages());
	}

	onMount(createHistory);
</script>
