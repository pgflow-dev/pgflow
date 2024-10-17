import type { Message, Conversation } from '$lib/db/chat';

export type ChatMessage = Pick<Message, 'content' | 'role' | 'conversation_id'>;
export type ChatConversation = Pick<Conversation, 'id' | 'created_at' | 'title'>;
export type ChatConversationWithMessages = ChatConversation & { messages: ChatMessage[] };
