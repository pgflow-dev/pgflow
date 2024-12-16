import { Flow } from "../_pgflow/Flow.ts";

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
  .step("transcribeVideo", async ({ run: { videoUrl } }) => {
    const transcript = await deepgram.transcribe(videoUrl);
    return transcript;
  })
  .step(
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
  .step(
    "writeToDb",
    ["transcribeVideo", "summarizeTranscript"],
    async ({ run: { videoId }, transcribeVideo, summarizeTranscript }) =>
      await db.videoSummaries.upsert({
        videoId,
        transcript: transcribeVideo,
        summary: summarizeTranscript,
      }),
  );

export default InngestFlow;

export type StepsType = ReturnType<typeof InngestFlow.getSteps>;
