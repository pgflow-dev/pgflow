import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import {
	BaseMessage,
	mapChatMessagesToStoredMessages,
	mapStoredMessagesToChatMessages
} from '@langchain/core/messages';
import type { StoredMessage } from '@langchain/core/messages';

export interface CustomChatMessageHistoryInput {
	sessionId: string;
}

export class CustomChatMessageHistory extends BaseListChatMessageHistory {
	lc_namespace = ['langchain', 'stores', 'message'];

	sessionId: string;

	fakeDatabase: Record<string, StoredMessage[]> = {};

	constructor(fields: CustomChatMessageHistoryInput) {
		super(fields);
		this.sessionId = fields.sessionId;
	}

	async getMessages(): Promise<BaseMessage[]> {
		const messages = this.fakeDatabase[this.sessionId];
		console.log('StoredMessage', messages);

		return mapStoredMessagesToChatMessages(messages);
	}

	async addMessage(message: BaseMessage): Promise<void> {
		if (this.fakeDatabase[this.sessionId] === undefined) {
			this.fakeDatabase[this.sessionId] = [];
		}

		const serializedMessages = mapChatMessagesToStoredMessages([message]);
		this.fakeDatabase[this.sessionId].push(serializedMessages[0]);
	}

	async addMessages(messages: BaseMessage[]): Promise<void> {
		if (this.fakeDatabase[this.sessionId] === undefined) {
			this.fakeDatabase[this.sessionId] = [];
		}

		const existingMessages = this.fakeDatabase[this.sessionId];
		const serializedMessages = mapChatMessagesToStoredMessages(messages);
		this.fakeDatabase[this.sessionId] = [...existingMessages, ...serializedMessages];
	}
}
