import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import { BaseMessage, mapChatMessagesToStoredMessages } from '@langchain/core/messages';
import type { StoredMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$backend/types';
import type { Writable } from 'svelte/store';
import { writable } from 'svelte/store';

export interface SupabaseChatMessageHistoryInput {
	conversationId: string;
	session: Session;
	supabase: SupabaseClient;
}

export type ChatMessage = Pick<
	Database['public']['Tables']['chat_messages']['Row'],
	'content' | 'role' | 'conversation_id'
>;

function mapPostgrestMessageToChatMessage(message: ChatMessage): BaseMessage {
	if (message.role == 'assistant') {
		return new AIMessage(message.content);
	} else if (message.role == 'user') {
		return new HumanMessage(message.content);
	} else {
		throw new Error(`Unknown role: ${message.role}`);
	}
}

function mapStoredMessagesToChatMessages(
	storedMessages: StoredMessage[],
	conversationId: string
): ChatMessage[] {
	storedMessages.forEach((message: StoredMessage) => {
		if (message.type !== 'human' && message.type !== 'ai') {
			throw `Unknown message type: ${message.type}`;
		}
	});

	return storedMessages.map((storedMessage) => {
		if (storedMessage.type == 'human') {
			return <ChatMessage>{
				conversation_id: conversationId,
				role: 'user',
				content: storedMessage.data.content
			};
		} else {
			return <ChatMessage>{
				conversation_id: conversationId,
				role: 'assistant',
				content: storedMessage.data.content
			};
		}
	});
}

export class SupabaseChatMessageHistory extends BaseListChatMessageHistory {
	lc_namespace = ['langchain', 'stores', 'message'];

	conversationId: string;
	session: Session;
	supabase: SupabaseClient;
	messagesStore: Writable<ChatMessage[]>;

	constructor(fields: SupabaseChatMessageHistoryInput) {
		console.log('SupabaseChatMessageHistory:constructor', fields);
		super(fields);
		this.conversationId = fields.conversationId;
		this.session = fields.session;
		this.supabase = fields.supabase;
		this.messagesStore = writable<ChatMessage[]>([]);
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
			this.messagesStore.set(<ChatMessage[]>rawMessages);
			const chatMessages = rawMessages.map(mapPostgrestMessageToChatMessage);
			return chatMessages;
		} else {
			this.messagesStore.set([]);
			return [];
		}
	}

	async addMessage(message: BaseMessage): Promise<void> {
		const storedMessage = mapChatMessagesToStoredMessages([message])[0];

		const chatMessage = mapStoredMessagesToChatMessages([storedMessage], this.conversationId)[0];
		const { error } = await this.supabase.from('chat_messages').insert([chatMessage]);

		if (error) {
			throw error;
		}

		this.messagesStore.update((chatMessages) => [...chatMessages, chatMessage]);
	}

	async addMessages(messages: BaseMessage[]): Promise<void> {
		const storedMessages = mapChatMessagesToStoredMessages(messages);
		const chatMessages = mapStoredMessagesToChatMessages(storedMessages, this.conversationId);

		const { error } = await this.supabase.from('chat_messages').insert(chatMessages);

		if (error) {
			throw error;
		}

		this.messagesStore.update((prevChatMessages) => [...prevChatMessages, ...chatMessages]);
	}
}
