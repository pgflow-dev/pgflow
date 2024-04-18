import { writable, derived, get } from 'svelte/store';
import { AIMessageChunk } from '@langchain/core/messages';
import {
	type SupabaseChatMessageHistory,
	chatMessageToBaseMessage
} from '$lib/chat_histories/SupabaseChatMessageHistory';
import type { RunnableSequence } from 'langchain/runnables';

type UseChatFields = {
	history: SupabaseChatMessageHistory;
	chain: RunnableSequence;
};

export function useChat({ history, chain }: UseChatFields) {
	const loading = writable<boolean>(false);
	const input = writable<string>('');

	const aiMessageChunk = writable<AIMessageChunk | null>(null);
	const baseMessages = derived(history.messagesStore, ($messages) => {
		return $messages.map(chatMessageToBaseMessage);
	});

	const messagesWithChunk = derived(
		[baseMessages, aiMessageChunk],
		([$messages, $aiMessageChunk]) => {
			if ($aiMessageChunk) {
				$messages = [...$messages, $aiMessageChunk];
			}
			return $messages;
		}
	);

	async function handleSubmit() {
		loading.set(true);

		const streamPromise = chain.stream({ input: get(input) });
		input.set('');
		const stream = await streamPromise;

		for await (const chunk of stream) {
			aiMessageChunk.update((c) => {
				return c ? c.concat(chunk) : chunk;
			});
		}

		const aiMessage = get(aiMessageChunk);
		if (aiMessage) {
			await history.addMessage(aiMessage);
		}

		aiMessageChunk.set(null);
		input.set('');
		loading.set(false);
	}

	return {
		input,
		handleSubmit,
		loading,
		messages: messagesWithChunk
	};
}
