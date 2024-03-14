import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import {
	BaseMessage,
	mapChatMessagesToStoredMessages
	// mapStoredMessagesToChatMessages
} from '@langchain/core/messages';
import type { StoredMessage } from '@langchain/core/messages';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

export interface SupabaseChatMessageHistoryInput {
	conversationId: string;
	session: Session;
	supabase: SupabaseClient;
}

import type { Database } from '$backend/types';
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

function mapPostgrestMessageToChatMessage(message: ChatMessage): BaseMessage {
	if (message.role == 'assistant') {
		return new AIMessage(message.content);
	} else if (message.role == 'user') {
		return new HumanMessage(message.content);
	} else {
		throw new Error(`Unknown role: ${message.role}`);
	}
}

export class SupabaseChatMessageHistory extends BaseListChatMessageHistory {
	lc_namespace = ['langchain', 'stores', 'message'];

	conversationId: string;
	session: Session;
	supabase: SupabaseClient;

	fakeDatabase: Record<string, StoredMessage[]> = {};

	constructor(fields: SupabaseChatMessageHistoryInput) {
		super(fields);
		this.conversationId = fields.conversationId;
		this.session = fields.session;
		this.supabase = fields.supabase;
	}

	async getMessages(): Promise<BaseMessage[]> {
		const { data: rawMessages, error } = await this.supabase
			.from('chat_messages')
			.select('*')
			.eq('conversation_id', this.conversationId)
			.order('created_at', { ascending: false });

		if (error) {
			throw error;
		}

		if (rawMessages) {
			return rawMessages.map(mapPostgrestMessageToChatMessage);
		} else {
			return [];
		}
	}

	async addMessage(message: BaseMessage): Promise<void> {
		if (this.fakeDatabase[this.conversationId] === undefined) {
			this.fakeDatabase[this.conversationId] = [];
		}

		const serializedMessages = mapChatMessagesToStoredMessages([message]);
		this.fakeDatabase[this.conversationId].push(serializedMessages[0]);
	}

	async addMessages(messages: BaseMessage[]): Promise<void> {
		if (this.fakeDatabase[this.conversationId] === undefined) {
			this.fakeDatabase[this.conversationId] = [];
		}

		const existingMessages = this.fakeDatabase[this.conversationId];
		const serializedMessages = mapChatMessagesToStoredMessages(messages);
		this.fakeDatabase[this.conversationId] = [...existingMessages, ...serializedMessages];
	}
}
