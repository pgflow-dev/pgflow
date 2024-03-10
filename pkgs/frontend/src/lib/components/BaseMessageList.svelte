<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { BaseMessage } from '@langchain/core/messages';

	export let messagesStore: Readable<BaseMessage[]>;
</script>

<div class="grid grid-cols-[auto_1fr] gap-2 w-full md:w-3/4">
	{#each $messagesStore as message}
		<div class="font-bold">{message.lc_id[message.lc_id.length - 1]}:</div>
		<div class="">{message.content}</div>
	{/each}
</div>
