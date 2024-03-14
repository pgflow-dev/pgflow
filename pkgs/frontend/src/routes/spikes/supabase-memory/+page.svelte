<script lang="ts">
	import { CustomChatMessageHistory } from '$lib/customChatMessageHistory';
	import { onMount } from 'svelte';

	const chatHistory = new CustomChatMessageHistory({ sessionId: 'test01' });

	async function createHistory() {
		await chatHistory.addAIMessage('how can i help you?');
		await chatHistory.addUserMessage('i need help with learning python');

		console.log('getMessages', await chatHistory.getMessages());
	}

	onMount(createHistory);
</script>
