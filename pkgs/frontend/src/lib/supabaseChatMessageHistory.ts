import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import {
	BaseMessage,
	mapChatMessagesToStoredMessages as mapBaseMessagesToStoredMessages
} from '@langchain/core/messages';
import type { StoredMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$backend/types';
import type { Writable } from 'svelte/store';
import { writable } from 'svelte/store';

export interface SupabaseChatMessageHistoryInput {
	conversationId: string;
	supabase: SupabaseClient;
}

export type ChatMessage = Pick<
	Database['public']['Tables']['chat_messages']['Row'],
	'content' | 'role' | 'conversation_id'
>;

export function chatMessageToBaseMessage(message: ChatMessage): BaseMessage {
	if (message.role == 'assistant') {
		return new AIMessage(message.content);
	} else if (message.role == 'user') {
		return new HumanMessage(message.content);
	} else {
		throw new Error(`Unknown role: ${message.role}`);
	}
}

export function mapStoredMessagesToChatMessages(
	storedMessages: StoredMessage[],
	conversationId: string
): ChatMessage[] {
	storedMessages.forEach((message: StoredMessage) => {
		if (message.type !== 'human' && message.type !== 'ai' && message.type !== 'generic') {
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
	supabase: SupabaseClient;
	messagesStore: Writable<ChatMessage[]>;

	constructor(fields: SupabaseChatMessageHistoryInput) {
		super(fields);
		this.conversationId = fields.conversationId;
		this.supabase = fields.supabase;
		this.messagesStore = writable<ChatMessage[]>([]);
	}

	async getMessages(): Promise<BaseMessage[]> {
		const { data: rawMessages, error } = await this.supabase
			.from('chat_messages')
			.select('*')
			.eq('conversation_id', this.conversationId)
			.order('created_at', { ascending: true });

		console.log('getMessages/rawMessages', rawMessages);

		if (error) {
			throw error;
		}

		// console.log('getMessages', rawMessages);
		if (rawMessages) {
			this.messagesStore.set(<ChatMessage[]>rawMessages);
			const chatMessages = rawMessages.map(chatMessageToBaseMessage);
			return chatMessages;
		} else {
			this.messagesStore.set([]);
			return [];
		}
	}

	async addMessage(message: BaseMessage): Promise<void> {
		console.log('addMessage/message', message);
		const storedMessage = mapBaseMessagesToStoredMessages([message])[0];
		console.log('addMessage/storedMessage', storedMessage);

		const chatMessage = mapStoredMessagesToChatMessages([storedMessage], this.conversationId)[0];
		const { error } = await this.supabase.from('chat_messages').insert([chatMessage]);

		if (error) {
			throw error;
		}

		console.log('addMessage/chatMessage', chatMessage);
		this.messagesStore.update((chatMessages) => {
			console.log({ chatMessages, chatMessage });
			return [...chatMessages, chatMessage];
		});
		console.log('after update');
	}

	async addMessages(messages: BaseMessage[]): Promise<void> {
		console.log('addMessages/messages', messages);
		const storedMessages = mapBaseMessagesToStoredMessages(messages);
		const chatMessages = mapStoredMessagesToChatMessages(storedMessages, this.conversationId);

		const { error } = await this.supabase.from('chat_messages').insert(chatMessages);

		if (error) {
			throw error;
		}

		this.messagesStore.update((prevChatMessages) => [...prevChatMessages, ...chatMessages]);
	}

	async clear(): Promise<void> {
		console.log('clear');
		await this.supabase.from('chat_messages').delete().eq('conversation_id', this.conversationId);
	}
}
