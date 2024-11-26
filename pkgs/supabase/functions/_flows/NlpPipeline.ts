import { Flow } from "../_pgflow/Flow.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// const randomSleep = () => sleep(Math.floor(Math.random() * 500 + 200)); // Random 1-5 seconds
const randomSleep = () => sleep(1); // Random 1-5 seconds

const NlpPipeline = new Flow<string>()
  .task("text_input", ({ run }) => {
    // await randomSleep();
    return `Input: ${run}`;
  })
  .task("openai_embeddings", ["text_input"], async ({ text_input }) => {
    //await randomSleep();
    return `OpenAI Embeddings: ${text_input}`;
  })
  .task(
    "huggingface_embeddings",
    ["openai_embeddings"],
    async ({ openai_embeddings }) => {
      //await randomSleep();
      return `HuggingFace: ${openai_embeddings}`;
    },
  )
  .task(
    "langchain_processing",
    ["huggingface_embeddings"],
    async ({ huggingface_embeddings }) => {
      //await randomSleep();
      return `LangChain: ${huggingface_embeddings}`;
    },
  )
  .task("bert_classification", ["text_input"], async ({ text_input }) => {
    //await randomSleep();
    return `BERT: ${text_input}`;
  })
  .task("gpt_summarization", ["text_input"], async ({ text_input }) => {
    //await randomSleep();
    return `GPT Summary: ${text_input}`;
  })
  .task(
    "sentiment_analysis",
    ["gpt_summarization"],
    async ({ gpt_summarization }) => {
      //await randomSleep();
      return `Sentiment: ${gpt_summarization}`;
    },
  )
  .task(
    "result_aggregation",
    ["langchain_processing", "bert_classification", "sentiment_analysis"],
    async ({
      langchain_processing,
      bert_classification,
      sentiment_analysis,
    }) => {
      return `Results: ${langchain_processing}, ${bert_classification}, ${sentiment_analysis}`;
    },
  );

export default NlpPipeline;
