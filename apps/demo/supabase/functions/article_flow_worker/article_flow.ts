import { Flow } from '@pgflow/dsl';
import { fetchArticle } from './tasks/fetch-article.ts';
import { summarizeArticle } from './tasks/summarize-article.ts';
import { extractKeywords } from './tasks/extract-keywords.ts';
import { publishArticle } from './tasks/publish-article.ts';

const SLEEP_MS = 1000;

function sleep(ms: number) {
	const time = 300 + ms * Math.random();
	return new Promise((resolve) => setTimeout(resolve, time));
}

// Flow definition - clean and minimal
export default new Flow<{ url: string }>({
	slug: 'article_flow',
	baseDelay: 1,
	maxAttempts: 2
})
	.step({ slug: 'fetchArticle' }, async (input) => {
		await sleep(SLEEP_MS);
		const startTime = Date.now();
		const result = await fetchArticle(input.run.url);
		const durationMs = Date.now() - startTime;
		return {
			...result,
			_timing: {
				fetchArticleDurationMs: durationMs,
				fetchedAt: new Date().toISOString()
			}
		};
	})
	.step({ slug: 'summarize', dependsOn: ['fetchArticle'], baseDelay: 1 }, async (input) =>
		summarizeArticle(input.fetchArticle.content)
	)
	.step({ slug: 'extractKeywords', dependsOn: ['fetchArticle'] }, async (input) =>
		extractKeywords(input.fetchArticle.content)
	)
	.step({ slug: 'publish', dependsOn: ['summarize', 'extractKeywords'] }, async (input) =>
		publishArticle(
			input.summarize.summary,
			input.summarize.sentiment,
			input.extractKeywords.keywords
		)
	);
