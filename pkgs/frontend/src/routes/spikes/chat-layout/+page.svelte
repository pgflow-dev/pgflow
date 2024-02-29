<script lang="ts">
	import ChatPage from '$lib/components/ChatPage.svelte';
	import type { ChatMessage } from '$lib/chatTypes';

	let currentMessage: string = '';
	let messages: ChatMessage[] = [
		{
			id: 0,
			host: true,
			avatar: 9,
			name: 'Jane',
			timestamp: 'Yesterday @ 2:30pm',
			message: 'Some message text.',
			color: 'variant-soft-primary'
		},
		{
			id: 1,
			host: false,
			avatar: 25,
			name: 'Michael',
			timestamp: 'Yesterday @ 2:45pm',
			message: 'Some message text.',
			color: 'variant-soft-primary'
		}
	];
</script>

<ChatPage bind:currentMessage {messages} />
