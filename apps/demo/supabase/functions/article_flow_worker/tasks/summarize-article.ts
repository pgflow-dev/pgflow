/**
 * Summarizes article content using LLM
 * Simulates failure on first attempt for demo purposes
 */

export async function summarizeArticle(content: string) {
	// Try to use real LLM if API key is available
	const groqApiKey = Deno.env.get('GROQ_API_KEY');
	const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

	if (groqApiKey) {
		return await summarizeWithGroq(content, groqApiKey);
	} else if (openaiApiKey) {
		return await summarizeWithOpenAI(content, openaiApiKey);
	} else {
		// Fallback to mock summary if no API keys
		return mockSummarize(content);
	}
}

async function summarizeWithGroq(content: string, apiKey: string) {
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
						'You are a helpful assistant that summarizes articles concisely. Also determine the overall sentiment (positive, negative, or neutral).'
				},
				{
					role: 'user',
					content: `Summarize this article in 2-3 sentences and determine its sentiment:\n\n${content.slice(0, 4000)}`
				}
			],
			temperature: 0.7,
			max_tokens: 200
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Groq API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	const fullResponse = data.choices[0].message.content;

	// Try to extract sentiment from response, default to neutral
	let sentiment = 'neutral';
	if (fullResponse.toLowerCase().includes('positive')) sentiment = 'positive';
	else if (fullResponse.toLowerCase().includes('negative')) sentiment = 'negative';

	return {
		summary: fullResponse,
		sentiment
	};
}

async function summarizeWithOpenAI(content: string, apiKey: string) {
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
						'You are a helpful assistant that summarizes articles concisely. Also determine the overall sentiment (positive, negative, or neutral).'
				},
				{
					role: 'user',
					content: `Summarize this article in 2-3 sentences and determine its sentiment:\n\n${content.slice(0, 4000)}`
				}
			],
			temperature: 0.7,
			max_tokens: 200
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	const fullResponse = data.choices[0].message.content;

	// Try to extract sentiment from response, default to neutral
	let sentiment = 'neutral';
	if (fullResponse.toLowerCase().includes('positive')) sentiment = 'positive';
	else if (fullResponse.toLowerCase().includes('negative')) sentiment = 'negative';

	return {
		summary: fullResponse,
		sentiment
	};
}

function mockSummarize(content: string) {
	const wordCount = content.split(/\s+/).length;
	const summary =
		`This article contains approximately ${wordCount} words and discusses various topics. ` +
		`It presents key insights and information that readers will find valuable.`;

	return {
		summary,
		sentiment: 'positive'
	};
}
