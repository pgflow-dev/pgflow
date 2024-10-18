import type { Session, User } from '@supabase/supabase-js';
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/auth/sign-in');
	}

	return { session, user } as { session: Session; user: User };
};
