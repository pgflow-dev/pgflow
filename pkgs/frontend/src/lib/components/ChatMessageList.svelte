<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { ChatMessage } from '$lib/supabaseChatMessageHistory';

	export let messagesStore: Readable<ChatMessage[]>;
	export let streamStore: Readable<ChatMessage | null>;
</script>

<div class="grid grid-cols-[auto_1fr] gap-2 w-full md:w-3/4">
	{#each $messagesStore as message}
		<div class="font-bold">{message.role}:</div>
		<div class="">{message.content}</div>
	{/each}

	{#if $streamStore}
		<div class="font-bold">{$streamStore.role}</div>
		<div class="">{$streamStore.content}</div>
	{/if}
</div>
