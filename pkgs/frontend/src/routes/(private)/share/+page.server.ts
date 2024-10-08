import type { Actions } from '@sveltejs/kit';

export const actions: Actions = {
	default: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();

		const title = formData.get('title') as string;
		const text = formData.get('text') as string;
		const url = formData.get('url') as string;
		const files = formData.getAll('files') as File[];

		console.log('formData', formData.entries());
		const content = `[${title}](${text})`;
		const response = await supabase.schema('feed').from('shares').insert({ content });
		console.log('response', response);

		const { status, error } = response;

		if (error || status < 200 || status >= 300) {
			console.log('error', error);
			return {
				success: false
			};
		}

		const processedData = {
			title,
			text,
			url,
			fileCount: files.length,
			fileNames: files.map((file) => file.name)
		};

		return { success: true, data: processedData };
	}
};
