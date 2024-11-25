import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { type RunFlow } from '$lib/db/pgflow';

export const load: PageLoad = async ({ parent, params: { flowSlug } }): Promise<void> => {
	const { supabase } = await parent();

	const { data: run, error } = await supabase
		.schema('pgflow')
		.rpc('run_flow', { p_flow_slug: flowSlug, p_payload: '<input>' })
		.single<RunFlow>();

	if (error) {
		redirect(302, '/pgflow');
	} else {
		if (run) {
			console.log('redirect', `/pgflow/${run.run_id}`);
			redirect(302, `/pgflow/${run.run_id}`);
		}
	}
};
