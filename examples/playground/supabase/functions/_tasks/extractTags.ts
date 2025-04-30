import Groq from 'groq-sdk';

let _groq: Groq | undefined;

function getGroq() {
  if (!_groq) {
    _groq = new Groq({
      apiKey: Deno.env.get('GROQ_API_KEY'),
    });
  }

  return _groq;
}

export default async (content: string) => {
  const chatCompletion = await getGroq().chat.completions.create({
    messages: [
      {
        role: 'system',
        content: 'You extract relevant keywords and tags from website content.',
      },
      {
        role: 'user',
        content: `Extract the most important keywords and tags from the following website content.
Return a JSON object with a single "keywords" field containing an array of strings.
Focus on the most relevant and descriptive terms that represent the main topics and themes.
Limit to 5-10 keywords maximum.

Website content:
${content}`,
      },
    ],
    model: 'llama-3.1-8b-instant',
    response_format: {
      type: 'json_object',
    },
  });

  // Parse the JSON response directly
  const responseJson = JSON.parse(
    chatCompletion.choices[0].message.content || '{}',
  );
  let keywords: string[] = []; // Default to empty array

  if (Array.isArray(responseJson.keywords)) {
    keywords = responseJson.keywords;
  }

  return {
    keywords: keywords,
  };
};
