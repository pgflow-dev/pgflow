import type { PageLoad } from './$types';
import { SupabaseChatMessageHistory } from '$lib/chat_histories/SupabaseChatMessageHistory';

export const load: PageLoad = async ({
	params,
	parent
}): Promise<{ history: SupabaseChatMessageHistory }> => {
	const parentData = await parent();
	const { supabase, session } = parentData;
	const { conversationId } = params;

	const history = new SupabaseChatMessageHistory({ supabase, session, conversationId });
	await history.getMessages();

	return { ...parentData, history };
};
