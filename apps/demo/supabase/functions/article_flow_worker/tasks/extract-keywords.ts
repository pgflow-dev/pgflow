/**
 * Extracts keywords from article content using LLM or fallback
 */

export async function extractKeywords(content: string) {
	// Try to use real LLM if API key is available
	const groqApiKey = Deno.env.get('GROQ_API_KEY');
	const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

	if (groqApiKey) {
		return await extractWithGroq(content, groqApiKey);
	} else if (openaiApiKey) {
		return await extractWithOpenAI(content, openaiApiKey);
	} else {
		// Fallback to simple extraction if no API keys
		return mockExtractKeywords(content);
	}
}

async function extractWithGroq(content: string, apiKey: string) {
	const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: 'llama-3.1-8b-instant',
			messages: [
				{
					role: 'system',
					content:
						'Extract 5 key topics or keywords from the article. Return only the keywords as a comma-separated list, no other text.'
				},
				{
					role: 'user',
					content: `Extract keywords from this article:\n\n${content.slice(0, 4000)}`
				}
			],
			temperature: 0.3,
			max_tokens: 100
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Groq API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	const keywordsText = data.choices[0].message.content;
	const keywords = keywordsText
		.split(',')
		.map((k: string) => k.trim())
		.filter((k: string) => k.length > 0);

	return {
		keywords: keywords.slice(0, 5)
	};
}

async function extractWithOpenAI(content: string, apiKey: string) {
	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: 'gpt-3.5-turbo',
			messages: [
				{
					role: 'system',
					content:
						'Extract 5 key topics or keywords from the article. Return only the keywords as a comma-separated list, no other text.'
				},
				{
					role: 'user',
					content: `Extract keywords from this article:\n\n${content.slice(0, 4000)}`
				}
			],
			temperature: 0.3,
			max_tokens: 100
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	const keywordsText = data.choices[0].message.content;
	const keywords = keywordsText
		.split(',')
		.map((k: string) => k.trim())
		.filter((k: string) => k.length > 0);

	return {
		keywords: keywords.slice(0, 5)
	};
}

function mockExtractKeywords(content: string) {
	// Simple word frequency approach for demo
	const words = content
		.toLowerCase()
		.replace(/[^\w\s]/g, '')
		.split(/\s+/)
		.filter((word) => word.length > 4); // Only words longer than 4 chars

	// Count word frequency
	const wordCount = new Map<string, number>();
	words.forEach((word) => {
		wordCount.set(word, (wordCount.get(word) || 0) + 1);
	});

	// Get top 5 most frequent words as keywords
	const keywords = Array.from(wordCount.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([word]) => word);

	// If we don't have enough keywords, add some defaults
	if (keywords.length < 3) {
		keywords.push('technology', 'innovation', 'article');
	}

	return {
		keywords: keywords.slice(0, 5)
	};
}
