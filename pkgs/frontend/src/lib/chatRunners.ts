import type { Runnable } from '@langchain/core/runnables';
import type { Readable } from 'svelte/store';
import { AIMessageChunk } from '@langchain/core/messages';
import { writable } from 'svelte/store';

const EMPTY_CHUNK = new AIMessageChunk('');

interface ChatRunnerOutput {
	sendMessage: (message: string) => Promise<void>;
	inProgress: Readable<boolean>;
	chunks: Readable<AIMessageChunk>;
}

interface RunConfig {
	sessionId: string;
}

export function createChatRunner(runnable: Runnable, runConfig: RunConfig): ChatRunnerOutput {
	const inProgress = writable(false);
	const chunks = writable<AIMessageChunk>(EMPTY_CHUNK);

	return {
		async sendMessage(content: string) {
			inProgress.set(true);
			chunks.set(EMPTY_CHUNK);

			try {
				const stream = await runnable.stream(content, { configurable: runConfig });

				for await (const chunk of stream) {
					console.log('chunk', chunk);
					chunks.update((prevChunk) => prevChunk.concat(chunk));
				}
			} finally {
				inProgress.set(false);
			}
		},
		inProgress: { subscribe: inProgress.subscribe },
		chunks: { subscribe: chunks.subscribe }
	};
}
