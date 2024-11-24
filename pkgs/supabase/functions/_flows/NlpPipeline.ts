import { Flow } from "../_pgflow/Flow.ts";

const NlpPipeline = new Flow<string>()
  .task("text_input", ({ run }) => `Input: ${run}`)
  .task(
    "openai_embeddings",
    ["text_input"],
    ({ text_input }) => `OpenAI Embeddings: ${text_input}`,
  )
  .task(
    "huggingface_embeddings",
    ["openai_embeddings"],
    ({ openai_embeddings }) => `HuggingFace: ${openai_embeddings}`,
  )
  .task(
    "langchain_processing",
    ["huggingface_embeddings"],
    ({ huggingface_embeddings }) => `LangChain: ${huggingface_embeddings}`,
  )
  .task(
    "bert_classification",
    ["text_input"],
    ({ text_input }) => `BERT: ${text_input}`,
  )
  .task(
    "gpt_summarization",
    ["text_input"],
    ({ text_input }) => `GPT Summary: ${text_input}`,
  )
  .task(
    "sentiment_analysis",
    ["gpt_summarization"],
    ({ gpt_summarization }) => `Sentiment: ${gpt_summarization}`,
  )
  .task(
    "result_aggregation",
    ["langchain_processing", "bert_classification", "sentiment_analysis"],
    ({ langchain_processing, bert_classification, sentiment_analysis }) =>
      `Results: ${langchain_processing}, ${bert_classification}, ${sentiment_analysis}`,
  );

export default NlpPipeline;
