import type { Actions } from '@sveltejs/kit';

export const actions: Actions = {
	default: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const formValues = Object.fromEntries(formData.entries());

		console.log('formValues', formValues);
		const response = await supabase
			.schema('feed')
			.from('shares')
			.insert({ content: JSON.stringify(formValues, null, 2) });
		console.log('response', response);

		const { status, error } = response;

		if (error || status < 200 || status >= 300) {
			console.log('error', error);
			return {
				success: false
			};
		}

		return { success: true, data: response.data };
	}
};
