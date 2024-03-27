import type { PageLoad } from './$types';
import type { ChatConversation } from '$lib/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseChatMessageHistory } from '$lib/chat_histories/SupabaseChatMessageHistory';

async function loadConversation(supabase: SupabaseClient, id: string): Promise<ChatConversation> {
	const { data: conversation, error } = await supabase
		.schema('chat')
		.from('conversations')
		.select('id, created_at, title')
		.eq('id', id)
		.single();

	if (error) {
		throw error;
	}

	return conversation;
}

export const load: PageLoad = async ({
	params,
	parent
}): Promise<{ conversation: ChatConversation; history: SupabaseChatMessageHistory }> => {
	console.log('new params', params);
	const { supabase } = await parent();
	const { conversationId } = params;

	const conversation = await loadConversation(supabase, conversationId);
	const history = new SupabaseChatMessageHistory({ supabase, conversationId });

	// preload messages
	await history.getMessages();

	return { conversation, history };
};
