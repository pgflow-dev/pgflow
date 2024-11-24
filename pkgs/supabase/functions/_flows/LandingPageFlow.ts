import { Flow } from "../_pgflow/Flow.ts";

function fetchVoiceMemo(voiceMemoId: string): File {
  return new File([], voiceMemoId);
}
function transcribeWithGroqWhisper(audioFile: File): string {
  return "the trascription of voice memo";
}

// everything below will get included, content above will be ignored in the docs
/////////////////////////////////////////////////////////////////////////////////////
export type RunPayload = {
  voiceMemoId: string;
  userId: string;
};

export const LandingPageFlow = new Flow<RunPayload>().task(
  "transcription",
  ({ run: { voiceMemoId, userId } }) => {
    const file = await fetchVoiceMemo(voiceMemoId);
    const transcription = await trancribeWithGroqWhisper(file);
  },
);
