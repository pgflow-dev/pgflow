<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { BaseMessage } from '@langchain/core/messages';

	export let messagesStore: Readable<BaseMessage[]>;

	const klassNameToRoleName: Record<string, string> = {
		HumanMessage: 'Human',
		AIMessage: 'Assistant',
		ChatMessageChunk: 'Assistant'
	};

	function roleNameFor(message: BaseMessage) {
		const klassName = message.lc_id[message.lc_id.length - 1];

		return klassNameToRoleName[klassName];
	}
</script>

<div class="grid grid-cols-[auto_1fr] gap-2 w-full md:w-3/4">
	{#each $messagesStore as message}
		<div class="font-bold">{roleNameFor(message)}:</div>
		<div class="">{message.content}</div>
	{/each}
</div>
