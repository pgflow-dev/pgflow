import { createBrowserClient, createServerClient, isBrowser, parse } from '@supabase/ssr';

export const load = async ({ data, depends, fetch }) => {
	depends('supabase:auth');

	const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
	const supabaseAnonKey =
		import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		console.error('Missing Supabase environment variables');
	}

	const supabase = isBrowser()
		? createBrowserClient(supabaseUrl, supabaseAnonKey, {
				global: { fetch },
				cookies: {
					get(key) {
						const cookie = parse(document.cookie);
						return cookie[key];
					}
				}
			})
		: createServerClient(supabaseUrl, supabaseAnonKey, {
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
