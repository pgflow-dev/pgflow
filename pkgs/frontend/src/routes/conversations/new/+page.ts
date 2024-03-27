import type { ChatConversation } from '$lib/db';
import { fail, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	const { supabase } = await parent();

	const { data, error } = await supabase
		.schema('chat')
		.from('conversations')
		.insert({ title: 'blank' })
		.select()
		.returns<ChatConversation>()
		.single();

	if (error) {
		throw error;
	}

	if (data) {
		const conversation: ChatConversation = data;

		redirect(302, `/conversations/${conversation.id}`);
	}

	fail(404);
};
