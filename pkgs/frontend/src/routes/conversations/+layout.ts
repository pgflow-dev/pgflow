import type { LayoutLoadEvent, LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import type { Session } from '@supabase/supabase-js';

export const load: LayoutLoad = async (event: LayoutLoadEvent) => {
	const parent = await event.parent();

	if (!parent.session) {
		redirect(302, '/auth/sign-in');
	}

	const session: Session = parent.session;

	return { ...parent, session };
};
