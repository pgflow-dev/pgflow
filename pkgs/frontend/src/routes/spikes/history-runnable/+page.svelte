<script lang="ts">
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { createProxiedChatModel } from '$lib/ProxiedChatOpenAI';
	import { ChatMessageHistoryStore } from '$lib/ChatMessageHistoryStore';
	// import Debug from '$components/Debug.svelte';
	import Prompt from '$components/Prompt.svelte';
	import ChatLayout from '$components/ChatLayout.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { createChainWithHistory } from '$lib/chains/createChainWithHistory';
	import { writable, derived, get } from 'svelte/store';
	import { AIMessageChunk } from '@langchain/core/messages';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	const history = new ChatMessageHistoryStore();

	const aiMessageChunk = writable<AIMessageChunk | null>(null);
	const messagesWithChunk = derived(
		[history.messagesStore, aiMessageChunk],
		([$messages, $aiMessageChunk]) => {
			if ($aiMessageChunk) {
				$messages = [...$messages, $aiMessageChunk];
			}
			return $messages;
		}
	);

	const prompt = ChatPromptTemplate.fromTemplate('{input}');
	const model = createProxiedChatModel('ChatOpenAI', session);

	const chain = createChainWithHistory({ prompt, model, history });

	let userInput = '';

	async function runStream() {
		const stream = await chain.stream({ input: userInput });

		for await (const chunk of stream) {
			aiMessageChunk.update((c) => {
				return c ? c.concat(chunk) : chunk;
			});
		}

		const aiMessage = get(aiMessageChunk);
		if (aiMessage) {
			history.addMessage(aiMessage);
		}

		aiMessageChunk.set(null);
		userInput = '';
	}
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<BaseMessageList messagesStore={messagesWithChunk} />
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt
			bind:value={userInput}
			on:submit={runStream}
			label="Send"
			placeholder="Ask a question"
		/>
	</svelte:fragment>
</ChatLayout>
