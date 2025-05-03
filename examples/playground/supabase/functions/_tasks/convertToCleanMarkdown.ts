import sanitizeHtml from 'npm:sanitize-html';
import { TurndownService } from 'npm:turndown';

export default async function convertToCleanMarkdown(rawHtml: string) {
  const cleanHtml = sanitizeHtml(rawHtml, {
    allowedTags: ['h1', 'h2', 'h3', 'p', 'a', 'ul', 'ol', 'li', 'code', 'pre'],
    allowedAttributes: {
      a: ['href', 'title'],
      code: ['class'],
    },
    allowedIframeHostnames: ['youtube.com'],
  });
  const turndown = new TurndownService();
  return turndown.turndown(cleanHtml);
}

// Usage
const markdown = await convertToCleanMarkdown('https://example.com');
console.log(markdown);
