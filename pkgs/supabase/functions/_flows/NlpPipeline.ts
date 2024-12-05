import { Flow } from "../_pgflow/Flow.ts";
import { randomSleep } from "../_pgflow/utils.ts";

async function simulateWorkAndError() {
  if (Math.random() < 0.3) {
    throw new Error("Simulated error");
  }

  await randomSleep(1000);
}

const NlpPipeline = new Flow<string>()
  .step("text_input", async ({ run }) => {
    await simulateWorkAndError();
    return `Input: ${run}`;
  })
  .step("openai_embeddings", ["text_input"], async ({ text_input }) => {
    await simulateWorkAndError();
    return `OpenAI Embeddings: ${text_input}`;
  })
  .step(
    "huggingface_embeddings",
    ["openai_embeddings"],
    async ({ openai_embeddings }) => {
      await simulateWorkAndError();
      return `HuggingFace: ${openai_embeddings}`;
    },
  )
  .step(
    "langchain_processing",
    ["huggingface_embeddings"],
    async ({ huggingface_embeddings }) => {
      await simulateWorkAndError();
      return `LangChain: ${huggingface_embeddings}`;
    },
  )
  .step("bert_classification", ["text_input"], async ({ text_input }) => {
    await simulateWorkAndError();
    return `BERT: ${text_input}`;
  })
  .step("gpt_summarization", ["text_input"], async ({ text_input }) => {
    await simulateWorkAndError();
    return `GPT Summary: ${text_input}`;
  })
  .step(
    "sentiment_analysis",
    ["gpt_summarization"],
    async ({ gpt_summarization }) => {
      await simulateWorkAndError();
      return `Sentiment: ${gpt_summarization}`;
    },
  )
  .step(
    "result_aggregation",
    ["langchain_processing", "bert_classification", "sentiment_analysis"],
    async ({
      langchain_processing,
      bert_classification,
      sentiment_analysis,
    }) => {
      await simulateWorkAndError();
      return `Results: ${langchain_processing}, ${bert_classification}, ${sentiment_analysis}`;
    },
  );

export default NlpPipeline;

export type StepsType = ReturnType<typeof NlpPipeline.getSteps>;
