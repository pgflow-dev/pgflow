import type { Database } from '$backend/types';

export type MessageRow = Database['chat']['Tables']['messages']['Row'];
export type ConversationRow = Database['chat']['Tables']['conversations']['Row'];

export type ChatMessage = Pick<MessageRow, 'content' | 'role' | 'conversation_id'>;
export type ChatConversation = Pick<ConversationRow, 'id' | 'created_at' | 'title'>;

export type ChatConversationWithMessages = ChatConversation & { messages: ChatMessage[] };
