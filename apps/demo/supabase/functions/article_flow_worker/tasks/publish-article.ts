/**
 * Publishes the processed article
 * For demo purposes, just generates a mock article ID
 */

export function publishArticle(summary: string, sentiment: string, keywords: string[]) {
	// Generate a mock article ID
	const articleId = `art_${crypto.randomUUID()}`;

	return {
		articleId,
		publishedAt: new Date().toISOString(),
		summary,
		sentiment,
		keywords
	};
}
