import { Flow } from '@pgflow/dsl';
import { fetchArticle } from './tasks/fetch-article.ts';
import { summarizeArticle } from './tasks/summarize-article.ts';
import { extractKeywords } from './tasks/extract-keywords.ts';
import { publishArticle } from './tasks/publish-article.ts';

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Flow definition - clean and minimal
export default new Flow<{ url: string }>({
	slug: 'article_flow',
	maxAttempts: 3
})
	.step({ slug: 'fetch_article' }, async (input) => fetchArticle(input.run.url))
	.step(
		{ slug: 'summarize', dependsOn: ['fetch_article'], baseDelay: 1 },
		async (input, context) => {
			const attemptNumber = context.rawMessage.read_ct;

			// Simulate failure on first attempt for retry demo
			if (attemptNumber === 1) {
				throw new Error('Simulated failure for retry demo');
			} else {
				await sleep(1000);
			}

			return summarizeArticle(input.fetch_article.content);
		}
	)
	.step({ slug: 'extract_keywords', dependsOn: ['fetch_article'] }, async (input) => {
		await sleep(1000);
		return extractKeywords(input.fetch_article.content);
	})
	.step({ slug: 'publish', dependsOn: ['summarize', 'extract_keywords'] }, async (input) => {
		await sleep(1000);
		return publishArticle({
			summary: input.summarize,
			keywords: input.extract_keywords
		});
	});
