import type { Actions } from '@sveltejs/kit';

export const actions: Actions = {
	default: async ({ request, locals: { supabase } }) => {
		const data = await request.formData();
		const content = data.get('content');

		const response = await supabase.schema('feed').from('notes').insert({ content });
		const { data: note } = response;

		if (response.error) {
			return {
				status: 500,
				body: response.error
			};
		}

		if (!note) {
			return {
				body: 'Note not created',
				status: 500
			};
		}

		return {
			status: 200,
			body: note
		};
	}
};
