/**
 * Test helpers and mock data for testing
 */

export const mockArticleContent = `
# Test Article Title

This is a test article with some content.

## Introduction

This article discusses testing and development practices.
We'll cover various topics including TypeScript, Deno, and testing strategies.

## Main Content

Testing is important for software development.
It helps ensure code quality and reliability.
Unit tests verify individual functions work correctly.
Integration tests verify components work together.

## Conclusion

Always write tests for your code.
`;

export const mockArticleUrl = 'https://example.com/article';

// Mock fetch for testing
export function createMockFetch(response: {
	ok: boolean;
	text?: string;
	status?: number;
	statusText?: string;
}) {
	return () =>
		Promise.resolve({
			ok: response.ok,
			status: response.status || 200,
			statusText: response.statusText || 'OK',
			text: () => Promise.resolve(response.text || '')
		} as Response);
}
