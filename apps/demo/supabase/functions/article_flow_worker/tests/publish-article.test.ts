import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { publishArticle } from '../tasks/publish-article.ts';

Deno.test('publishArticle - generates article ID and timestamp', () => {
  const data = {
    summary: { summary: 'Test summary', sentiment: 'positive' },
    keywords: { keywords: ['test', 'article', 'keywords'] }
  };

  const result = publishArticle(data);

  // Check that required fields exist
  assert(result.articleId, 'Should have articleId');
  assert(result.publishedAt, 'Should have publishedAt timestamp');
  assert(result.summary, 'Should include summary data');
  assert(result.keywords, 'Should include keywords data');

  // Verify articleId format (starts with art_ and has UUID format)
  assert(result.articleId.startsWith('art_'), 'Article ID should start with art_');
  assert(result.articleId.length > 10, 'Article ID should be substantial');

  // Verify timestamp is valid ISO string
  const timestamp = new Date(result.publishedAt);
  assert(!isNaN(timestamp.getTime()), 'Timestamp should be valid date');

  console.log('✓ Article publishing works');
  console.log(`  Article ID: ${result.articleId}`);
  console.log(`  Published at: ${result.publishedAt}`);
});

Deno.test('publishArticle - includes all input data in output', () => {
  const complexData = {
    summary: {
      summary: 'Complex test summary with multiple sentences.',
      sentiment: 'neutral'
    },
    keywords: {
      keywords: ['artificial', 'intelligence', 'machine', 'learning', 'technology']
    }
  };

  const result = publishArticle(complexData);

  // Verify all input data is preserved
  assertEquals(result.summary, complexData.summary);
  assertEquals(result.keywords, complexData.keywords);

  console.log('✓ All input data preserved in output');
});

Deno.test('publishArticle - generates unique IDs', () => {
  const data = {
    summary: { summary: 'Test', sentiment: 'positive' },
    keywords: { keywords: ['test'] }
  };

  const result1 = publishArticle(data);
  const result2 = publishArticle(data);
  const result3 = publishArticle(data);

  // All IDs should be unique
  assert(result1.articleId !== result2.articleId, 'IDs should be unique');
  assert(result2.articleId !== result3.articleId, 'IDs should be unique');
  assert(result1.articleId !== result3.articleId, 'IDs should be unique');

  console.log('✓ Generates unique article IDs');
  console.log(`  Sample IDs: ${result1.articleId}, ${result2.articleId}`);
});