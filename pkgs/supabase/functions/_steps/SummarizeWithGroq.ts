import Groq from "groq-sdk";

const groq = new Groq({ apiKey: Deno.env.get("GROQ_API_KEY") });

export default async (content: string) => {
  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "Summarize the voice memo in one, concise sentence. Output only this sentence, nothing else",
      },
      { role: "user", content: transcribe.transcription },
    ],
    model: "mixtral-8x7b-32768",
    temperature: 0,
    max_tokens: 1024,
  });

  return chatCompletion.choices[0].message.content;
};
