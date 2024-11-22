import type { SupabaseClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { Flow } from "./Flow.ts";
import createChatCompletion from "../_steps/SummarizeWithGroq.ts";

const supabase: SupabaseClient = {} as SupabaseClient;
const groq = new Groq();

type RunPayload = {
  objectId: string;
  objectName: string;
  bucketId: string;
  ownerId: string;
};

type MergeHandlerPayload = {
  summarize: {
    summary: string | null;
  };
  capitalize: string;
};
type MergeHandlerReturn = [string | null, string];

function mergeHandler(payload: MergeHandlerPayload): MergeHandlerReturn {
  return [payload.summarize.summary, payload.capitalize];
}

const ProcessVoiceMemo = new Flow<RunPayload>()
  .task("transcribe", async ({ objectName, bucketId }) => {
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
  .task(
    "summarize",
    ["transcribe"],
    async ({ transcribe }) => await createChatCompletion(transcribe),
  )
  .task("capitalize", ["transcribe"], ({ transcribe: { transcription } }) => {
    return transcription.toUpperCase();
  })
  .task("merge", ["summarize", "capitalize"], mergeHandler);
export default ProcessVoiceMemo;

export type StepsType = ReturnType<typeof ProcessVoiceMemo.getSteps>;
