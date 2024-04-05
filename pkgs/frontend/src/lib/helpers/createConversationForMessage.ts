import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createTitleizeChain } from '$lib/chains/createTitleizeChain';
import type { ChatConversation, ChatMessage } from '$lib/db';

type CreateConversationForMessageFields = {
	supabase: SupabaseClient;
	session: Session;
	chatMessage: ChatMessage;
};

export async function createConversationForMessage({
	supabase,
	session,
	chatMessage
}: CreateConversationForMessageFields) {
	const titleizeChain = createTitleizeChain(session);
	const title = await titleizeChain.invoke({ input: chatMessage.content });

	const { data, error } = await supabase
		.schema('chat')
		.from('conversations')
		.insert({ id: chatMessage.conversation_id, title })
		.returns<ChatConversation>();

	if (error) {
		throw error;
	}

	return data;
}
