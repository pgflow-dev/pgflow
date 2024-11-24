import { Flow } from "../_pgflow/Flow.ts";

// original code from https://www.inngest.com/

type RunPayload = {
  videoUrl: string;
  videoId: string;
  userId: string;
};

const deepgram = {
  transcribe: async (videoUrl: string) => {
    return "hey, transcribed text here";
  },
};
const llm = {
  createCompletion: async ({ model, prompt }) => {
    return "hey, completion here";
  },
};
const db = {
  videoSummaries: {
    upsert: async ({ videoId, transcript, summary }) => {
      return "hey, db here";
    },
  },
};
function createSummaryPrompt(transcript: string) {
  return `Summarize this video transcript: "${transcript}"`;
}

const InngestFlow = new Flow<RunPayload>()
  .task("transcribeVideo", async ({ run: { videoUrl } }) => {
    const transcript = await deepgram.transcribe(videoUrl);
    return transcript;
  })
  .task(
    "summarizeTranscript",
    ["transcribeVideo"],
    async ({ transcribeVideo }) => {
      const summary = await llm.createCompletion({
        model: "gpt-4o",
        prompt: createSummaryPrompt(transcribeVideo),
      });
      return summary;
    },
  )
  .task(
    "writeToDb",
    ["transcribeVideo", "summarizeTranscript"],
    async ({ run: { videoId }, transcribeVideo, summarizeTranscript }) =>
      await db.videoSummaries.upsert({
        videoId,
        transcript: transcribeVideo,
        summary: summarizeTranscript,
      }),
  );

export type StepsType = ReturnType<typeof InngestFlow.getSteps>;
