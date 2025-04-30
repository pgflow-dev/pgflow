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
        role: 'user',
        content: `Please provide a concise summary of the following content:\n\n${content}`,
      },
    ],
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
  });

  const summary = chatCompletion.choices[0].message.content;

  return {
    aiSummary: summary ?? 'Summary not available, please try again.',
  };
};
