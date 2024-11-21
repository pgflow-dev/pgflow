import type { SupabaseClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { Flow } from "./Flow.ts";
import type { Database } from "../../types.d.ts";

const supabase: SupabaseClient = {} as SupabaseClient;
const groq = new Groq();

type Share = Database["feed"]["Tables"]["shares"]["Row"];

type NewShareHandlerInput = {
  transcription: string;
  run: { ownerId: string };
};
type NewShareHandlerOutput = Share;

const NewShareHandler = async ({
  transcription,
  run: { ownerId },
}: NewShareHandlerInput): Promise<NewShareHandlerOutput> => {
  const response = await supabase
    .schema("feed")
    .from("shares")
    .upsert({
      ownerId,
      content: transcription,
    })
    .returns<Share>();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
};

type RunPayload = {
  objectId: string;
  objectName: string;
  bucketId: string;
  ownerId: string;
};

const ProcessVoiceMemo = new Flow<RunPayload>()
  .task("transcription", async ({ objectName, bucketId }) => {
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

    return transcription.text;
  })
  .task("newShare", ["transcription"], NewShareHandler);
export default ProcessVoiceMemo;

export type StepsType = ReturnType<typeof ProcessVoiceMemo.getSteps>;
