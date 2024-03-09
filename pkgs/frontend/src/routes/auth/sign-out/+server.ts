import type { RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const GET = async (event: RequestEvent) => {
	const {
		locals: { supabase }
	} = event;

	await supabase.auth.signOut();

	throw redirect(302, '/');
};
