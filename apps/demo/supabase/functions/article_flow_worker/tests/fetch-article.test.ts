import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { fetchArticle } from '../tasks/fetch-article.ts';
import { load } from 'https://deno.land/std@0.208.0/dotenv/mod.ts';

// Load environment variables from .env file if it exists
await load({ envPath: '../.env', export: true }).catch(() => {
	console.log('No .env file found, using environment variables');
});

Deno.test('fetchArticle - fetches real article from Hacker News', async () => {
	// Use a stable HN article URL that should always exist
	const url = 'https://news.ycombinator.com/item?id=35629516';

	const result = await fetchArticle(url);

	// Verify we got a result with both content and title
	assert(result.content, 'Should have content');
	assert(result.title, 'Should have title');
	assert(result.content.length > 100, 'Content should be substantial');
	assert(result.title !== 'Untitled Article', 'Should extract a real title');

	console.log(`✓ Fetched article: "${result.title}" (${result.content.length} chars)`);
});

Deno.test('fetchArticle - fetches real article from TechCrunch', async () => {
	// Use TechCrunch homepage which should always work
	const url = 'https://techcrunch.com';

	const result = await fetchArticle(url);

	assert(result.content, 'Should have content');
	assert(result.title, 'Should have title');
	assert(result.content.length > 100, 'Content should be substantial');

	console.log(`✓ Fetched article: "${result.title}" (${result.content.length} chars)`);
});

Deno.test({
	name: 'fetchArticle - handles non-existent URL gracefully',
	sanitizeResources: false, // Disable resource leak check for this test
	fn: async () => {
		const url = 'https://this-domain-definitely-does-not-exist-12345.com/article';

		try {
			await fetchArticle(url);
			assert(false, 'Should have thrown an error');
		} catch (error) {
			assert(error instanceof Error);
			assert(error.message.includes('Failed to fetch'));
			console.log('✓ Properly handles fetch errors');
		}
	}
});
