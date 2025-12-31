import { assert, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { summarizeArticle } from '../../../tasks/summarize-article.ts';
import { load } from 'https://deno.land/std@0.208.0/dotenv/mod.ts';

// Load environment variables from .env file if it exists
await load({ envPath: '../.env', export: true }).catch(() => {
	console.log('No .env file found, using environment variables');
});

const testContent = `
Artificial intelligence is rapidly transforming how we work and live.
Machine learning models are becoming more sophisticated and accessible.
Natural language processing has made significant breakthroughs recently.
Companies are investing heavily in AI research and development.
The future of technology is closely tied to advances in artificial intelligence.
`;

Deno.test('summarizeArticle - fails on first attempt (retry simulation)', async () => {
	// First attempt should always throw an error (simulated failure)
	await assertRejects(
		async () => await summarizeArticle(testContent, 1),
		Error,
		'Simulated failure for retry demo'
	);
	console.log('✓ First attempt fails as expected (retry simulation)');
});

Deno.test('summarizeArticle - succeeds on second attempt with mock data', async () => {
	// Temporarily clear API keys to test mock behavior
	const groqKey = Deno.env.get('GROQ_API_KEY');
	const openaiKey = Deno.env.get('OPENAI_API_KEY');

	Deno.env.delete('GROQ_API_KEY');
	Deno.env.delete('OPENAI_API_KEY');

	const result = await summarizeArticle(testContent, 2);

	assert(result.summary, 'Should have summary');
	assert(result.sentiment, 'Should have sentiment');
	assert(result.summary.includes('words'), 'Mock summary should mention word count');

	console.log('✓ Mock summary works on second attempt');

	// Restore API keys
	if (groqKey) Deno.env.set('GROQ_API_KEY', groqKey);
	if (openaiKey) Deno.env.set('OPENAI_API_KEY', openaiKey);
});

Deno.test('summarizeArticle - works with Groq API if key provided', async () => {
	const hasGroqKey = !!Deno.env.get('GROQ_API_KEY');

	if (!hasGroqKey) {
		console.log('⚠ Skipping Groq API test (no GROQ_API_KEY in environment)');
		console.log('  To run this test, copy .env.example to .env and add your Groq API key');
		return;
	}

	const result = await summarizeArticle(testContent, 2);

	assert(result.summary, 'Should have summary');
	assert(result.sentiment, 'Should have sentiment');
	assert(
		['positive', 'negative', 'neutral'].includes(result.sentiment),
		'Should have valid sentiment'
	);
	assert(result.summary.length > 20, 'Summary should be substantial');

	console.log('✓ Groq API summarization works');
	console.log(`  Summary: ${result.summary.substring(0, 100)}...`);
	console.log(`  Sentiment: ${result.sentiment}`);
});

Deno.test('summarizeArticle - works with OpenAI API if key provided', async () => {
	const hasOpenAIKey = !!Deno.env.get('OPENAI_API_KEY');

	if (!hasOpenAIKey) {
		console.log('⚠ Skipping OpenAI API test (no OPENAI_API_KEY in environment)');
		console.log('  To run this test, copy .env.example to .env and add your OpenAI API key');
		return;
	}

	// Temporarily remove Groq key to test OpenAI
	const groqKey = Deno.env.get('GROQ_API_KEY');
	Deno.env.delete('GROQ_API_KEY');

	const result = await summarizeArticle(testContent, 2);

	assert(result.summary, 'Should have summary');
	assert(result.sentiment, 'Should have sentiment');
	assert(
		['positive', 'negative', 'neutral'].includes(result.sentiment),
		'Should have valid sentiment'
	);
	assert(result.summary.length > 20, 'Summary should be substantial');

	console.log('✓ OpenAI API summarization works');
	console.log(`  Summary: ${result.summary.substring(0, 100)}...`);
	console.log(`  Sentiment: ${result.sentiment}`);

	// Restore Groq key
	if (groqKey) Deno.env.set('GROQ_API_KEY', groqKey);
});

Deno.test('summarizeArticle - handles long content', async () => {
	// Create a longer piece of content
	const longContent = testContent.repeat(100); // Make it much longer

	const result = await summarizeArticle(longContent, 2);

	assert(result.summary, 'Should handle long content');
	assert(result.sentiment, 'Should determine sentiment for long content');

	console.log('✓ Handles long content properly');
});
