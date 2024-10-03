import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { ChatConversation } from '$lib/db';

export const load: PageLoad = async ({
	parent
}): Promise<{ conversations: ChatConversation[] }> => {
	const { supabase, session } = await parent();

	const { data, error } = await supabase
		.schema('chat')
		.from('conversations')
		.select()
		.eq('user_id', session.user.id)
		.order('created_at', { ascending: false });

	if (error || !data) {
		redirect(302, '/');
	}

	console.log('==== conversations/+page.ts');

	return { conversations: data };
};
