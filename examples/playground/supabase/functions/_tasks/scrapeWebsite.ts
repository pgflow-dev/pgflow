export default async function scrapeWebsite(url: string) {
  await simulateFailure();
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status}`);
  }

  const rawContent = await response.text();

  // Extract text content from HTML
  const textContent = stripHtmlTags(rawContent);

  return {
    content: textContent,
  };
}

/**
 * Strips HTML tags from content and extracts text
 * Focuses on content within the body tag and removes scripts, styles, etc.
 */
function stripHtmlTags(html: string): string {
  // Extract body content if possible
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Remove script and style tags and their contents
  let cleanedContent = bodyContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove HTML tags but preserve line breaks
  cleanedContent = cleanedContent
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '');

  // Decode HTML entities
  cleanedContent = cleanedContent
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Remove excessive whitespace
  cleanedContent = cleanedContent
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanedContent;
}

async function simulateFailure() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  throw new Error('Simulated failure to demonstrate error handling');
}
