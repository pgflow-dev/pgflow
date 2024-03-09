import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { getSession, checkIsSuperadmin } }) => {
	const [session, isSuperadmin] = await Promise.all([getSession(), checkIsSuperadmin()]);

	return {
		session,
		isSuperadmin
	};
};
