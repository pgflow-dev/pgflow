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
        content:
          'You analyze the sentiment of text and return a score between 0.0 and 1.0.',
      },
      {
        role: 'user',
        content: `Analyze the sentiment of the following content and return a JSON object with a single "sentiment" field containing a number between 0.0 and 1.0, where:
- 1.0 represents extremely positive sentiment
- 0.5 represents neutral sentiment
- 0.0 represents extremely negative sentiment

Content to analyze:
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
  let sentimentScore = 0.5; // Default to neutral

  if (typeof responseJson.sentiment === 'number') {
    sentimentScore = responseJson.sentiment;
  }

  return {
    score: sentimentScore,
  };
};
