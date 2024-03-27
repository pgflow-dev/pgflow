<script lang="ts">
	import type { BaseMessage } from '@langchain/core/messages';
	import { marked } from 'marked';

	export let message: BaseMessage;

	const klassNameToRoleName: Record<string, string> = {
		HumanMessage: 'Human',
		AIMessage: 'Assistant',
		ChatMessageChunk: 'Assistant'
	};
	function roleNameFor(message: BaseMessage) {
		const klassName = message.lc_id[message.lc_id.length - 1];

		return klassNameToRoleName[klassName];
	}

	$: bgColor = roleNameFor(message) === 'Human' ? 'bg-surface-800' : 'bg-surface-500';
</script>

<div class="p-2 {bgColor} rounded-xl m-3 text-justify">
	{#if roleNameFor(message) === 'Human'}
		<div class="font-bold flex items-center mb-2">You</div>
		<article class="prose dark:prose-invert">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html marked.parse(message.content.toString())}
		</article>
	{:else}
		<span class="font-bold flex items-center">Assistant</span>
		<article class="prose dark:prose-invert prose-sm">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html marked.parse(message.content.toString())}
		</article>
	{/if}
</div>
