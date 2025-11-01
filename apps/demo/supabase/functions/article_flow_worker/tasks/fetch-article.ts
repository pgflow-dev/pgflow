/**
 * Fetches article content from a given URL using Jina Reader API
 */

export async function fetchArticle(url: string) {
	const jinaUrl = `https://r.jina.ai/${url}`;

	try {
		const response = await fetch(jinaUrl, {
			// headers: {
			//   // Optional: Add Jina API key if available
			//   ...(Deno.env.get('JINA_API_KEY') && {
			//     'Authorization': `Bearer ${Deno.env.get('JINA_API_KEY')}`
			//   })
			// }
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch article: ${response.status} ${response.statusText}`);
		}

		const content = await response.text();

		// Try to extract title from the content
		// Jina typically puts the title in the first line or as markdown heading
		const lines = content.split('\n');
		let title = 'Untitled Article';

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('http')) {
				// Remove markdown heading markers if present
				title = trimmed.replace(/^#+\s*/, '');
				break;
			}
		}

		return {
			content,
			title
		};
	} catch (error) {
		console.error('Error fetching article:', error);
		throw new Error(`Failed to fetch article from ${url}: ${error.message}`);
	}
}
