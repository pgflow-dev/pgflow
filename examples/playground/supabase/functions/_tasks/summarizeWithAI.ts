import { randomSleep } from '../utils.ts';

import Groq from 'groq-sdk';

export default async (content: string) => {
  const client = new Groq({
    apiKey: Deno.env.get('GROQ_API_KEY'),
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
  });

  const chatCompletion = await client.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: `Please provide a concise summary of the following content:\n\n${content}`,
      },
    ],
    model: 'llama3-8b-8192',
  });

  return {
    aiSummary: chatCompletion.choices[0].message.content,
  };
};
