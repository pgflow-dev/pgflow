import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { extractKeywords } from '../tasks/extract-keywords.ts';
import { load } from 'https://deno.land/std@0.208.0/dotenv/mod.ts';

// Load environment variables from .env file if it exists
await load({ envPath: '../.env', export: true }).catch(() => {
	console.log('No .env file found, using environment variables');
});

const testContent = `
Artificial intelligence and machine learning are revolutionizing technology.
Deep learning neural networks enable powerful pattern recognition.
Natural language processing helps computers understand human language.
Computer vision allows machines to interpret visual information.
These artificial intelligence technologies are transforming industries worldwide.
`;

Deno.test('extractKeywords - extracts keywords with mock function', async () => {
	// Temporarily clear API keys to test mock behavior
	const groqKey = Deno.env.get('GROQ_API_KEY');
	const openaiKey = Deno.env.get('OPENAI_API_KEY');

	Deno.env.delete('GROQ_API_KEY');
	Deno.env.delete('OPENAI_API_KEY');

	const result = await extractKeywords(testContent);

	assert(result.keywords, 'Should have keywords array');
	assert(Array.isArray(result.keywords), 'Keywords should be an array');
	assert(result.keywords.length > 0, 'Should extract at least one keyword');
	assert(result.keywords.length <= 5, 'Should not exceed 5 keywords');

	console.log('✓ Mock keyword extraction works');
	console.log(`  Keywords: ${result.keywords.join(', ')}`);

	// Restore API keys
	if (groqKey) Deno.env.set('GROQ_API_KEY', groqKey);
	if (openaiKey) Deno.env.set('OPENAI_API_KEY', openaiKey);
});

Deno.test('extractKeywords - works with Groq API if key provided', async () => {
	const hasGroqKey = !!Deno.env.get('GROQ_API_KEY');

	if (!hasGroqKey) {
		console.log('⚠ Skipping Groq API test (no GROQ_API_KEY in environment)');
		console.log('  To run this test, copy .env.example to .env and add your Groq API key');
		return;
	}

	const result = await extractKeywords(testContent);

	assert(result.keywords, 'Should have keywords array');
	assert(Array.isArray(result.keywords), 'Keywords should be an array');
	assert(result.keywords.length > 0, 'Should extract at least one keyword');
	assert(result.keywords.length <= 5, 'Should not exceed 5 keywords');

	// Should likely find AI-related keywords in our test content
	const keywordsLower = result.keywords.map((k) => k.toLowerCase());
	const hasRelevantKeyword = keywordsLower.some(
		(k) =>
			k.includes('artificial') ||
			k.includes('intelligence') ||
			k.includes('ai') ||
			k.includes('machine') ||
			k.includes('learning')
	);
	assert(hasRelevantKeyword, 'Should extract relevant keywords from content');

	console.log('✓ Groq API keyword extraction works');
	console.log(`  Keywords: ${result.keywords.join(', ')}`);
});

Deno.test('extractKeywords - works with OpenAI API if key provided', async () => {
	const hasOpenAIKey = !!Deno.env.get('OPENAI_API_KEY');

	if (!hasOpenAIKey) {
		console.log('⚠ Skipping OpenAI API test (no OPENAI_API_KEY in environment)');
		console.log('  To run this test, copy .env.example to .env and add your OpenAI API key');
		return;
	}

	// Temporarily remove Groq key to test OpenAI
	const groqKey = Deno.env.get('GROQ_API_KEY');
	Deno.env.delete('GROQ_API_KEY');

	const result = await extractKeywords(testContent);

	assert(result.keywords, 'Should have keywords array');
	assert(Array.isArray(result.keywords), 'Keywords should be an array');
	assert(result.keywords.length > 0, 'Should extract at least one keyword');
	assert(result.keywords.length <= 5, 'Should not exceed 5 keywords');

	console.log('✓ OpenAI API keyword extraction works');
	console.log(`  Keywords: ${result.keywords.join(', ')}`);

	// Restore Groq key
	if (groqKey) Deno.env.set('GROQ_API_KEY', groqKey);
});

Deno.test('extractKeywords - handles short content', async () => {
	const shortContent = 'This is a very short piece of text.';

	const result = await extractKeywords(shortContent);

	assert(result.keywords, 'Should handle short content');
	assert(Array.isArray(result.keywords), 'Keywords should be an array');
	assert(result.keywords.length > 0, 'Should extract keywords even from short content');

	console.log('✓ Handles short content');
	console.log(`  Keywords from short text: ${result.keywords.join(', ')}`);
});
