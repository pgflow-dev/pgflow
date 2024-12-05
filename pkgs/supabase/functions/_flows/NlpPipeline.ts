import { Flow } from "../_pgflow/Flow.ts";
import { simulateWorkThenError } from "../_pgflow/utils.ts";

type Params = {
  text: string;
};

const NlpPipeline = new Flow<Params>()
  .step("text_input", async ({ run }) => {
    await simulateWorkThenError();
    return `Input: ${run}`;
  })
  .step("openai_embeddings", ["text_input"], async ({ text_input }) => {
    await simulateWorkThenError();
    return `OpenAI Embeddings: ${text_input}`;
  })
  .step(
    "huggingface_embeddings",
    ["openai_embeddings"],
    async ({ openai_embeddings }) => {
      await simulateWorkThenError();
      return `HuggingFace: ${openai_embeddings}`;
    },
  )
  .step(
    "langchain_processing",
    ["huggingface_embeddings"],
    async ({ huggingface_embeddings }) => {
      await simulateWorkThenError();
      return `LangChain: ${huggingface_embeddings}`;
    },
  )
  .step("bert_classification", ["text_input"], async ({ text_input }) => {
    await simulateWorkThenError();
    return `BERT: ${text_input}`;
  })
  .step("gpt_summarization", ["text_input"], async ({ text_input }) => {
    await simulateWorkThenError();
    return `GPT Summary: ${text_input}`;
  })
  .step(
    "sentiment_analysis",
    ["gpt_summarization"],
    async ({ gpt_summarization }) => {
      await simulateWorkThenError();
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
      await simulateWorkThenError();
      return `Results: ${langchain_processing}, ${bert_classification}, ${sentiment_analysis}`;
    },
  );

export default NlpPipeline;

export type StepsType = ReturnType<typeof NlpPipeline.getSteps>;
