<script lang="ts">
	import type { BaseMessage } from '@langchain/core/messages';
	import type { Readable } from 'svelte/store';
	import Message from './Message.svelte';

	export let messagesStore: Readable<BaseMessage[]>;
	export let scrollToBottom: () => void;

	$: $messagesStore && scrollToBottom();
</script>

{#each $messagesStore as message}
	<Message {message} />
{/each}
