<script lang="ts">
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { onMount } from 'svelte';
	import { RemoteModel } from '$lib/remoteRunnables';
	import type { AIMessageChunk } from '@langchain/core/messages';

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
		const model = RemoteModel('ChatOpenAI', session, { timeout: 30000 });

		const stream = await model.stream(await prompt.invoke(input));

		for await (const chunk of stream) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			response.update((c: any) => {
				if (c && c.concat) {
					return c.concat(chunk);
				} else {
					return chunk;
				}
			});
			console.log(chunk);
		}
	});
</script>

{#if $response}
	<div>{$response.content}</div>
{/if}
