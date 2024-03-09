import type { Runnable } from '@langchain/core/runnables';
import { writable, derived } from 'svelte/store';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';

export function createChatWithHistoryRunner(runnable: Runnable) {
	const inProgress = writable(false);
	const history = writable<BaseMessage[]>([]);

	async function runChain(input: string) {
		inProgress.set(true);

		try {
			const stream = await runnable.stream({ query: input });

			for await (const chunk of stream) {
				let message: string;
				if (chunk && typeof chunk === 'string') {
					message = chunk;
				} else {
					console.log('typeof', typeof chunk);
					console.dir(chunk);
					message = chunk.message;
				}

				history.update(($prevHistory) => {
					return [...$prevHistory, new HumanMessage({ content: message })];
				});
			}
		} finally {
			inProgress.set(false);
		}
	}

	return {
		runChain,
		inProgress: derived(inProgress, ($inProgress) => $inProgress),
		history: derived(history, ($history) => $history)
	};
}

export function createChatRunner(runnable: Runnable) {
	const inProgress = writable(false);
	const response = writable('');
	// const startTime = writable(0);
	// const timeElapsedMs = writable(0);
	// let interval: ReturnType<typeof setInterval>;

	async function runChain(input: string) {
		inProgress.set(true);
		response.set('');
		// timeElapsedMs.set(0);

		// const startTime = performance.now(); // Start the timer

		// Start updating time every 10ms
		// interval = setInterval(() => {
		// 	timeElapsedMs.set(performance.now() - startTime);
		// }, 10);

		try {
			const stream = await runnable.stream({ query: input });
			console.log('stream', stream);

			//timeElapsedMs = performance.now() - startTime;

			for await (const chunk of stream) {
				let message: string;
				if (chunk && typeof chunk === 'string') {
					message = chunk;
				} else {
					console.log('typeof', typeof chunk);
					console.dir(chunk);
					message = chunk.message;
				}

				// timeElapsedMs = performance.now() - startTime;
				response.update(($prevResponse) => {
					console.log($prevResponse);

					return `${$prevResponse}${message}`;
				});
			}
		} finally {
			// clearInterval(interval);
			// timeElapsedMs = performance.now() - startTime;
			inProgress.set(false);
			// currentMessage = '';
		}
	}

	return {
		runChain,
		inProgress: derived(inProgress, ($inProgress) => $inProgress),
		response: derived(response, ($response) => $response)
	};
}
