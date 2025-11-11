import { Flow } from '@pgflow/dsl';
import { fetchArticle } from './tasks/fetch-article.ts';
// import { summarizeArticle } from './tasks/summarize-article.ts';
// import { extractKeywords } from './tasks/extract-keywords.ts';
// import { publishArticle } from './tasks/publish-article.ts';

const SLEEP_MS = 1000;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Flow definition - clean and minimal
export default new Flow<{ url: string }>({
	slug: 'article_flow',
	maxAttempts: 3
})
	.step({ slug: 'fetchArticle' }, async (input) => {
		await sleep(SLEEP_MS);
		return fetchArticle(input.run.url);
	})
	.step({ slug: 'summarize', dependsOn: ['fetchArticle'], baseDelay: 1 }, async () => {
		// Simulate failure on first attempt for retry demo
		// if (context.rawMessage.read_ct === 1) {
		// 	throw new Error('Simulated failure for retry demo');
		// } else {
		await sleep(SLEEP_MS);
		// }

		return 'DEBUG ARTICLE CONTENT'; //summarizeArticle(input.fetchArticle.content);
	})
	.step({ slug: 'extractKeywords', dependsOn: ['fetchArticle'] }, async () => {
		await sleep(SLEEP_MS);
		return { keywords: ['ai', 'llm', 'agent'] }; //extractKeywords(input.fetchArticle.content);
	})
	.step({ slug: 'publish', dependsOn: ['summarize', 'extractKeywords'] }, async () => {
		await sleep(SLEEP_MS);
		// Step handler acts as adapter - extracting specific fields from previous steps

		return {
			articleId: 'art_123',
			// publishedAt: new Date().toISOString(),
			publishedAt: '2023-05-01T00:00:00.000Z',
			summary: 'DEBUG SUMMARY',
			sentiment: 'positive',
			keywords: ['ai', 'llm', 'agent']
		};
		// return publishArticle(
		// 	input.summarize.summary,
		// 	input.summarize.sentiment,
		// 	input.extractKeywords.keywords
		// );
	});
