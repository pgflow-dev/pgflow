import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import { BaseMessage } from '@langchain/core/messages';
import type { Unsubscriber } from 'svelte/store';
import { writable } from 'svelte/store';

export class ChatMessageHistoryStore extends BaseListChatMessageHistory {
	lc_namespace = ['langchain', 'stores', 'message'];

	messagesStore = writable<BaseMessage[]>([]);
	private messages: BaseMessage[] = [];
	private unsubscriber: Unsubscriber | null = null;

	constructor() {
		super({});

		this.unsubscriber = this.messagesStore.subscribe((messages) => {
			this.messages = messages;
		});
	}

	async getMessages(): Promise<BaseMessage[]> {
		return this.messages;
	}

	async addMessage(message: BaseMessage): Promise<void> {
		this.messagesStore.update((prevMessages) => {
			return [...prevMessages, message];
		});
	}

	async addMessages(messages: BaseMessage[]): Promise<void> {
		this.messagesStore.update((prevMessages) => {
			return [...prevMessages, ...messages];
		});
	}

	async clear(): Promise<void> {
		this.messagesStore.set([]);
	}
}
