import type { LayoutLoadEvent, LayoutLoad } from './$types';
import { fail } from '@sveltejs/kit';

export const load: LayoutLoad = async (event: LayoutLoadEvent) => {
	const parent = await event.parent();

	if (!parent.session) {
		throw fail(403, { message: 'Not logged in' });
	}

	return parent;
};
