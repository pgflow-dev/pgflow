import type { RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const GET = async (event: RequestEvent) => {
	const {
		url,
		locals: { supabase }
	} = event;
	const code = url.searchParams.get('code') as string;
	const next = url.searchParams.get('next') ?? '/';

	console.log('/auth/callback', {
		url,
		params: event.params,
		searchParams: url.searchParams,
		code,
		next
	});

	if (code) {
		console.log('/auth/callback - CODE IS PRESENT', code);
		const { data, error } = await supabase.auth.exchangeCodeForSession(code);
		console.log('/auth/callback - AFTER exchangeCodeForSession', { data, error });

		const sess = await supabase.auth.getSession();
		console.log('/auth/callback - getSession()', sess);

		if (!error) {
			throw redirect(303, `/${next.slice(1)}`);
		}
	}

	console.log('/auth/callback - NO CODE!!!!!');

	// return the user to an error page with instructions
	throw redirect(303, '/auth/auth-code-error');
};
