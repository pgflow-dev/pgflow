import Groq from "groq-sdk";
const groq = new Groq();

type SummarizeInput = {
  transcribe: {
    transcription: string;
  };
  run: {
    ownerId: string;
  };
};
type SummarizeOutput = {
  summary: string | null;
  runOwnerId: string;
};

export default async function handleSummarize({
  transcribe,
  run,
}: SummarizeInput): Promise<SummarizeOutput> {
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

  return {
    summary: chatCompletion.choices[0].message.content,
    runOwnerId: run.ownerId,
  };
}
