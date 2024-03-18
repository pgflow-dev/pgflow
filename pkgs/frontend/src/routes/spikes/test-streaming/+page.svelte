<script lang="ts">
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { onMount } from 'svelte';
	import { RemoteRunnable } from '@langchain/core/runnables/remote';
	import type { AIMessageChunk } from '@langchain/core/messages';

	import { writable } from 'svelte/store';
	const response = writable<AIMessageChunk | null>();

	onMount(async () => {
		const input = { topic: 'cats' };

		const prompt = ChatPromptTemplate.fromTemplate(
			'Tell me a joke about {topic}, but create a really long introduction to make it hit harder'
		);
		const model = new RemoteRunnable({ url: `http://localhost:8081/models/ChatOpenAI` });

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
