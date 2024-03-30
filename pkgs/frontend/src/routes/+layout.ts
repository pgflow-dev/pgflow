import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { LayoutLoad } from './$types';
import { createBrowserClient, isBrowser, parse } from '@supabase/ssr';
import { setCurrentSupabase } from '$lib/stores/current';

export const load: LayoutLoad = async ({ fetch, data, depends }) => {
	depends('supabase:auth');

	console.log('==== +layout.ts');

	const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: {
			fetch
		},
		cookies: {
			get(key) {
				if (!isBrowser()) {
					return JSON.stringify(data.session);
				}

				const cookie = parse(document.cookie);
				return cookie[key];
			}
		}
	});
	setCurrentSupabase(supabase);

	return { ...data, supabase };
};
