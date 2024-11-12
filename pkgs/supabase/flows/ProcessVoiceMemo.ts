import type { SupabaseClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { Flow } from "./Flow.ts";

const supabase: SupabaseClient = {} as SupabaseClient;
const groq = new Groq();

type RunPayload = {
  objectId: string;
  objectName: string;
  bucketId: string;
  ownerId: string;
};

const ProcessVoiceMemo = new Flow<RunPayload>()
  .addRootStep("transcribe", async ({ objectName, bucketId }) => {
    const response = await supabase.storage.from(bucketId).download(objectName);

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (!response.data) {
      throw new Error("No data found");
    }

    // Convert Blob to File with required properties
    const audioFile = new File(
      [new Uint8Array(await response.data.arrayBuffer())],
      objectName,
      {
        type: response.data.type,
        lastModified: Date.now(),
      },
    );

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      language: "en",
      response_format: "verbose_json",
    });

    if (!transcription.text) {
      throw new Error("No transcription found");
    }

    return { transcription: transcription.text };
  })
  .addStep(
    "summarize",
    ["transcribe"],
    async ({ transcribe, __run__: { ownerId } }) => {
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
        runOwnerId: ownerId,
      };
    },
  )
  .addStep(
    "capitalize",
    ["transcribe"],
    ({ transcribe: { transcription } }) => {
      return transcription.toUpperCase();
    },
  )
  .addStep("merge", ["summarize", "capitalize"], (payload) => {
    return JSON.stringify(payload);
  });
export default ProcessVoiceMemo;

export type StepsType = ReturnType<typeof ProcessVoiceMemo.getSteps>;
