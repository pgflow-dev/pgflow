<script lang="ts">
	import Prompt from '$components/Prompt.svelte';
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import { RemoteChatOpenAI } from '$lib/remoteRunnables';

	export let currentMessage: string = 'jakie prawa ma uczeń w polskiej szkole?';
	export let inProgress: boolean;
	let response: string = '';

	async function runChain() {
		inProgress = true;
		response = '';

		const promptTemplate = ChatPromptTemplate.fromTemplate('Tell me a joke about {query}');
		const model = RemoteChatOpenAI();
		const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

		try {
			const stream = await chain.stream({ query: currentMessage });

			response = '';

			for await (const chunk of stream) {
				console.log('chunk', chunk);
				if (chunk && typeof chunk === 'string') {
					response += chunk;
				}
			}
		} finally {
			inProgress = false;
			currentMessage = '';
		}
	}
</script>

<div class="flex flex-col h-screen relative">
	<div class="flex-grow flex items-end justify-center">
		<div class="w-full flex justify-center p-4">
			<div class="w-3/4 text-justify overflow-hidden">
				{response}
			</div>
		</div>
	</div>
	<div class="w-full p-4">
		<div class="w-3/4 mx-auto pb-10">
			<Prompt
				bind:value={currentMessage}
				bind:inProgress
				on:submit={runChain}
				placeholder="prawo oświatowe i edukacja w polsce"
				label="zapytaj"
			/>
		</div>
	</div>
</div>
