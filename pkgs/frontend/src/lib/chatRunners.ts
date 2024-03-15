import type { Runnable } from '@langchain/core/runnables';
import type { Readable } from 'svelte/store';
import { AIMessageChunk } from '@langchain/core/messages';
import { writable } from 'svelte/store';

const EMPTY_CHUNK = new AIMessageChunk('');

interface ChatRunnerOutput {
	sendMessage: (input: object) => Promise<void>;
	inProgress: Readable<boolean>;
	chunks: Readable<AIMessageChunk>;
}

export function createChatRunner(runnable: Runnable): ChatRunnerOutput {
	const inProgress = writable(false);
	const chunks = writable<AIMessageChunk>(EMPTY_CHUNK);

	return {
		async sendMessage(input: object) {
			inProgress.set(true);
			chunks.set(EMPTY_CHUNK);

			try {
				const stream = await runnable.stream(input);

				for await (const chunk of stream) {
					chunks.update((prevChunk) => {
						return prevChunk.concat(chunk);
					});
				}
			} finally {
				inProgress.set(false);
			}
		},
		inProgress: { subscribe: inProgress.subscribe },
		chunks: { subscribe: chunks.subscribe }
	};
}
