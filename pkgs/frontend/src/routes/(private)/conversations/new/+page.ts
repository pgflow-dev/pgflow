import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// import { goto } from '$app/navigation';
import { v4 as uuidv4 } from 'uuid';

export const load: PageLoad = async (): Promise<void> => {
	const newConversationId = uuidv4();

	redirect(303, `/conversations/${newConversationId}`);
};
