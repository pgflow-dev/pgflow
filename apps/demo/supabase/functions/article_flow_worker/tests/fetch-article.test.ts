import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { stub } from 'https://deno.land/std@0.208.0/testing/mock.ts';
import { fetchArticle } from '../tasks/fetch-article.ts';
import { load } from 'https://deno.land/std@0.208.0/dotenv/mod.ts';

// Load environment variables from .env file if it exists
await load({ envPath: '../.env', export: true }).catch(() => {
	console.log('No .env file found, using environment variables');
});

const mockJinaResponse = `# Mock Article Title

This is mock content with enough text to pass validation tests.
It has multiple lines and is over 100 characters long.
`;

function stubFetch(response: { status: number; statusText: string; body?: string }) {
	return stub(globalThis, 'fetch', () =>
		Promise.resolve(
			new Response(response.body || '', {
				status: response.status,
				statusText: response.statusText
			})
		)
	);
}

function stubFetchError(error: Error) {
	return stub(globalThis, 'fetch', () => Promise.reject(error));
}

// Mocked tests (always run)
Deno.test('fetchArticle - fetches article with mocked fetch', async () => {
	const fetchStub = stubFetch({ status: 200, statusText: 'OK', body: mockJinaResponse });

	try {
		const url = 'https://example.com/article';
		const result = await fetchArticle(url);

		assert(result.content, 'Should have content');
		assert(result.title, 'Should have title');
		assert(result.content.length > 100, 'Content should be substantial');
		assert(result.title === 'Mock Article Title', 'Should extract title from mock response');

		console.log('✓ Mock fetch works');
	} finally {
		fetchStub.restore();
	}
});

Deno.test('fetchArticle - handles non-OK response with mocked fetch', async () => {
	const fetchStub = stubFetch({
		status: 451,
		statusText: 'Unavailable For Legal Reasons',
		body: 'Unavailable'
	});

	try {
		const url = 'https://example.com/blocked-article';
		await fetchArticle(url);
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error instanceof Error);
		assert(error.message.includes('Failed to fetch'));
		assert(error.message.includes('451'));
		console.log('✓ Properly handles non-OK responses');
	} finally {
		fetchStub.restore();
	}
});

Deno.test({
	name: 'fetchArticle - handles network errors with mocked fetch',
	sanitizeResources: false,
	fn: async () => {
		const fetchStub = stubFetchError(new TypeError('Network error'));

		try {
			const url = 'https://example.com/article';
			await fetchArticle(url);
			assert(false, 'Should have thrown an error');
		} catch (error) {
			assert(error instanceof Error);
			assert(error.message.includes('Failed to fetch'));
			console.log('✓ Properly handles network errors');
		} finally {
			fetchStub.restore();
		}
	}
});

// Real HTTP tests (only run when USE_REAL_HTTP=true)
if (Deno.env.get('USE_REAL_HTTP') === 'true') {
	Deno.test('fetchArticle - fetches real article from Hacker News', async () => {
		const url = 'https://news.ycombinator.com/item?id=35629516';

		const result = await fetchArticle(url);

		assert(result.content, 'Should have content');
		assert(result.title, 'Should have title');
		assert(result.content.length > 100, 'Content should be substantial');
		assert(result.title !== 'Untitled Article', 'Should extract a real title');

		console.log(`✓ Fetched real article: "${result.title}" (${result.content.length} chars)`);
	});

	Deno.test('fetchArticle - fetches real article from TechCrunch', async () => {
		const url = 'https://techcrunch.com';

		const result = await fetchArticle(url);

		assert(result.content, 'Should have content');
		assert(result.title, 'Should have title');
		assert(result.content.length > 100, 'Content should be substantial');

		console.log(`✓ Fetched real article: "${result.title}" (${result.content.length} chars)`);
	});
} else {
	console.log('ℹ Skipping real HTTP tests (set USE_REAL_HTTP=true to run them)');
}
