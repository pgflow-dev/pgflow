import type { Actions } from '@sveltejs/kit';

export const actions: Actions = {
	default: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const formValues = Object.fromEntries(formData.entries());

		let content: string;

		const id = formValues['id'];
		if (formValues['__source'] && formValues['__source'] === 'webapp') {
			content = formValues['content'].toString();
		} else {
			content = JSON.stringify(formValues, null, 2);
		}
		console.log('content', content);

		const response = await supabase.schema('feed').from('shares').insert({ id, content });

		const { status, error } = response;
		console.log({ status, error });

		if (error || status < 200 || status >= 300) {
			return {
				success: false
			};
		}

		return { success: true, data: response.data };
	}
};
