import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import {
	BaseMessage,
	mapChatMessagesToStoredMessages as mapBaseMessagesToStoredMessages
} from '@langchain/core/messages';
import type { StoredMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Writable } from 'svelte/store';
import { get, writable } from 'svelte/store';
import type { ChatMessage } from '$lib/db';
import { RunnableLambda } from '@langchain/core/runnables';
import type { ChatPromptValue } from '@langchain/core/prompt_values';
import { createConversationForMessage } from '$lib/helpers/createConversationForMessage';

export interface SupabaseChatMessageHistoryInput {
	conversationId: string;
	supabase: SupabaseClient;
	session: Session;
}

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
	session: Session;
	messagesStore: Writable<ChatMessage[]>;
	messagesLoaded: boolean;

	constructor(fields: SupabaseChatMessageHistoryInput) {
		super(fields);
		this.conversationId = fields.conversationId;
		this.supabase = fields.supabase;
		this.session = fields.session;
		this.messagesStore = writable<ChatMessage[]>([]);
		this.messagesLoaded = false;
	}

	async getMessages(): Promise<BaseMessage[]> {
		await this.ensureMessagesLoaded();

		return get(this.messagesStore).map(chatMessageToBaseMessage);
	}

	async ensureMessagesLoaded(): Promise<void> {
		if (!this.messagesLoaded) {
			const { data: rawMessages, error } = await this.supabase
				.schema('chat')
				.from('messages')
				.select('*')
				.eq('conversation_id', this.conversationId)
				.order('created_at', { ascending: true });

			if (error) {
				throw error;
			}

			if (rawMessages) {
				this.messagesStore.set(<ChatMessage[]>rawMessages);
			} else {
				this.messagesStore.set([]);
			}

			this.messagesLoaded = true;
		}
	}

	async addMessage(message: BaseMessage): Promise<void> {
		const storedMessage = mapBaseMessagesToStoredMessages([message])[0];

		const chatMessage = mapStoredMessagesToChatMessages([storedMessage], this.conversationId)[0];
		const { error } = await this.supabase.schema('chat').from('messages').insert([chatMessage]);

		if (error) {
			throw error;
		}

		this.messagesStore.update((chatMessages) => {
			return [...chatMessages, chatMessage];
		});

		if (get(this.messagesStore).length === 1) {
			await createConversationForMessage({
				supabase: this.supabase,
				session: this.session,
				chatMessage
			});
		}
	}

	async addMessages(messages: BaseMessage[]): Promise<void> {
		const storedMessages = mapBaseMessagesToStoredMessages(messages);
		const chatMessages = mapStoredMessagesToChatMessages(storedMessages, this.conversationId);

		const { error } = await this.supabase.schema('chat').from('messages').insert(chatMessages);

		if (error) {
			throw error;
		}

		this.messagesStore.update((prevChatMessages) => [...prevChatMessages, ...chatMessages]);
	}

	async clear(): Promise<void> {
		await this.supabase
			.schema('chat')
			.from('messages')
			.delete()
			.eq('conversation_id', this.conversationId);
		this.messagesStore.set([]);
	}

	asLoaderRunnable() {
		return new RunnableLambda({
			func: () => this.getMessages()
		});
	}

	asSaverRunnable() {
		return new RunnableLambda({
			func: (chatPromptValue: ChatPromptValue) => {
				const { messages } = chatPromptValue;
				const humanMessage = messages[messages.length - 1];
				this.addMessage(humanMessage);

				return chatPromptValue;
			}
		});
	}
}
