import { createBrowserClient, createServerClient, isBrowser, parse } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends('supabase:auth');

	const supabase = isBrowser()
		? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: { fetch },
				cookies: {
					get(key) {
						const cookie = parse(document.cookie);
						return cookie[key];
					}
				}
			})
		: createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: { fetch },
				cookies: {
					get() {
						return JSON.stringify(data.session);
					}
				}
			});

	const {
		data: { session }
	} = await supabase.auth.getSession();

	const {
		data: { user }
	} = await supabase.auth.getUser();

	return { session, supabase, user };
};
