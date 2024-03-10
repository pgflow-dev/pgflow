import type { Runnable } from '@langchain/core/runnables';
import { writable } from 'svelte/store';
import { BaseMessage, AIMessage, HumanMessage } from '@langchain/core/messages';

export function createChatWithHistoryRunner(runnable: Runnable) {
	const inProgress = writable(false);
	const historyStore = writable<BaseMessage[]>([]);
	let history: BaseMessage[] = [];

	historyStore.subscribe(($historyStore) => (history = $historyStore));

	function addMessage(message: BaseMessage) {
		historyStore.update(($prevhistoryStore) => {
			return [...$prevhistoryStore, message];
		});
	}

	async function runChain(input: string) {
		addMessage(new HumanMessage({ content: input }));

		inProgress.set(true);

		try {
			const stream = await runnable.stream({ input, history });

			for await (const chunk of stream) {
				if (chunk && typeof chunk === 'string') {
					console.log('chunk - string', chunk);
					addMessage(new AIMessage({ content: chunk }));
				} else {
					console.log('chunk - object (AIMessage)', chunk);
					addMessage(chunk);
				}
			}
		} finally {
			inProgress.set(false);
		}
	}

	return {
		runChain,
		inProgress: { subscribe: inProgress.subscribe },
		history: { subscribe: historyStore.subscribe }
	};
}
