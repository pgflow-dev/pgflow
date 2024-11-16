import { Flow } from "./Flow.ts";

// original code from https://www.inngest.com/
//
// export const processVideo = inngest.createFunction(
//   { id: "process-video",
//     concurrency: { limit: 5, key: "event.data.userId" } },
//   { event: "video/uploaded" },
//   async ({ event, step }) => {
//
//     // step.run is a code-level transaction:  it retries automatically
//     // on failure and only runs once on success.
//     const transcript = await step.run('transcribe-video',
//       async () => deepgram.transcribe(event.data.videoUrl)
//     )
//
//     // function state is automatically managed for fault tolerance
//     // across steps.
//     const summary = await step.run('summarize-transcript',
//       async () => llm.createCompletion({
//         model: "gpt-4o",
//         prompt: createSummaryPrompt(transcript),
//       })
//     )
//
//     // easily chain a series of calls without managing infrastructure.
//     await step.run('write-to-db',
//       async () => db.videoSummaries.upsert({
//         videoId: event.data.videoId,
//         transcript,
//         summary,
//       })
//     )
//   }
// );

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
  .task("transcribeVideo", async ({ videoUrl }) => {
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
    async ({ __run__: { videoId }, transcribeVideo, summarizeTranscript }) => {
      await db.videoSummaries.upsert({
        videoId,
        transcript: transcribeVideo,
        summary: summarizeTranscript,
      });
      return {
        videoId,
        transcript: transcribeVideo,
        summary: summarizeTranscript,
      };
    },
  );

export type StepsType = ReturnType<typeof InngestFlow.getSteps>;
