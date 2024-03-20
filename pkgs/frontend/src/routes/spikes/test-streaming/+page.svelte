<script lang="ts">
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { onMount } from 'svelte';
	import type { AIMessageChunk } from '@langchain/core/messages';
	import { createProxiedChatModel } from '$lib/ProxiedChatOpenAI';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	import { writable } from 'svelte/store';
	const response = writable<AIMessageChunk | null>();

	onMount(async () => {
		const input = { topic: 'cats' };

		const prompt = ChatPromptTemplate.fromTemplate(
			'Tell me a joke about {topic}, but create a really long introduction to make it hit harder'
		);
		const model = createProxiedChatModel('ChatOpenAI', session);
		const chain = prompt.pipe(model);

		const stream = await chain.stream(input);

		for await (const chunk of stream) {
			console.log({ chunk });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			response.update((c: any) => {
				if (c && c.concat) {
					return c.concat(chunk);
				} else {
					return chunk;
				}
			});
		}

		console.log('after stream');
	});
</script>

{#if $response}
	<div>{$response.content}</div>
{/if}
