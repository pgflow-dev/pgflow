/**
 * Publishes the processed article
 * For demo purposes, just generates a mock article ID
 */

export function publishArticle(data: { summary: any; keywords: any }) {
  // Generate a mock article ID
  const articleId = `art_${crypto.randomUUID()}`;

  return {
    articleId,
    publishedAt: new Date().toISOString(),
    ...data
  };
}