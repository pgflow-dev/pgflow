import type { LayoutLoadEvent, LayoutLoad } from './$types';
import { fail } from '@sveltejs/kit';
import type { Session } from '@supabase/supabase-js';

export const load: LayoutLoad = async (event: LayoutLoadEvent) => {
	const parent = await event.parent();

	if (!parent.session) {
		throw fail(403, { message: 'Not logged in' });
	}

	const session: Session = parent.session;

	return { ...parent, session };
};
