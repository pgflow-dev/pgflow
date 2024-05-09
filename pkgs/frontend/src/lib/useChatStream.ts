import { writable, derived, get } from 'svelte/store';
import { AIMessageChunk, HumanMessage } from '@langchain/core/messages';

import {
	type SupabaseChatMessageHistory,
	chatMessageToBaseMessage
} from '$lib/chat_histories/SupabaseChatMessageHistory';
import type { Runnable } from 'langchain/runnables';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';

type UseChatFields = {
	history: SupabaseChatMessageHistory;
	chain: Runnable;
	finalStream: string;
};

export function useChatStream({ history, chain, finalStream }: UseChatFields) {
	const loading = writable<boolean>(false);
	const input = writable<string>('');

	const events = writable<StreamEvent[]>([]);
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

		const inputValue = get(input);
		const messagesValue = await history.getMessages();

		const stream = chain.streamEvents(
			{ input: inputValue, messages: messagesValue },
			{ version: 'v1' }
		);
		input.set('');

		// no need to wait for it now, need to be awaited before saving ai response
		const addHumanMessagePromise = history.addMessage(new HumanMessage(inputValue));

		for await (const event of stream) {
			events.update((e) => [...e, event]);

			if (event.name == finalStream && event.event === 'on_chain_stream') {
				aiMessageChunk.update((c) => {
					return c ? c.concat(event.data.chunk) : event.data.chunk;
				});
			}
		}

		const aiMessage = get(aiMessageChunk);
		aiMessageChunk.set(null);

		if (aiMessage) {
			console.log('aiMessage', aiMessage);
			await addHumanMessagePromise;
			await history.addMessage(aiMessage);
		}

		loading.set(false);
	}

	return {
		input,
		handleSubmit,
		loading: { subscribe: loading.subscribe },
		messages: messagesWithChunk,
		events: { subscribe: events.subscribe }
	};
}
