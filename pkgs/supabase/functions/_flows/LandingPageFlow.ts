function fetchVoiceMemo(voiceMemoId: string): File {
  return new File([], voiceMemoId);
}
function transcribeWithGroqWhisper(audioFile: File): string {
  return "the trascription of voice memo";
}

import { Flow } from "./Flow.ts";

// everything below will get included, content above will be ignored in the docs
/////////////////////////////////////////////////////////////////////////////////////
export type RunPayload = {
  voiceMemoId: string;
  userId: string;
};

export const LandingPageFlow = new Flow<RunPayload>().task(
  "transcription",
  ({ voiceMemoId, userId }) => {
    const file = await fetchVoiceMemo(voiceMemoId);
    const transcription = await trancribeWithGroqWhisper(file);
  },
);
