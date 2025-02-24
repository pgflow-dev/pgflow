/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly PUBLIC_SUPABASE_URL: string;
	readonly PUBLIC_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
import { createBrowserClient, createServerClient, isBrowser, parse } from '@supabase/ssr';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends('supabase:auth');

	const supabase = isBrowser()
		? createBrowserClient(
				import.meta.env.PUBLIC_SUPABASE_URL,
				import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
				{
					global: { fetch },
					cookies: {
						get(key) {
							const cookie = parse(document.cookie);
							return cookie[key];
						}
					}
				}
			)
		: createServerClient(
				import.meta.env.PUBLIC_SUPABASE_URL,
				import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
				{
					global: { fetch },
					cookies: {
						get() {
							return JSON.stringify(data.session);
						}
					}
				}
			);

	const {
		data: { session }
	} = await supabase.auth.getSession();

	const {
		data: { user }
	} = await supabase.auth.getUser();

	return { session, supabase, user };
};
