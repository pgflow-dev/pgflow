import { Flow } from './dsl.js';

// Provide a type for the input of the Flow
type Input = {
  url: string;
};

export const AnalyzeWebsite = new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 3,
  baseDelay: 5,
  timeout: 10,
})
  .step(
    { slug: 'website' },
    // Root step: receives flowInput directly
    async (flowInput) => await scrapeWebsite(flowInput.url)
  )
  .step(
    { slug: 'sentiment', dependsOn: ['website'], timeout: 30, maxAttempts: 5 },
    // Dependent step: receives deps, flowInput via context
    async (deps) => await analyzeSentiment(deps.website.content)
  )
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    // Dependent step: receives deps
    async (deps) => await summarizeWithAI(deps.website.content)
  )
  .step(
    { slug: 'saveToDb', dependsOn: ['sentiment', 'summary'] },
    // Dependent step needing flowInput: access via ctx.flowInput
    async (deps, ctx) => {
      const results = await saveToDb({
        websiteUrl: ctx.flowInput.url,
        sentiment: deps.sentiment.score,
        summary: deps.summary.aiSummary,
      });
      return results.status;
    }
  );

/***********************************************************************
 ****** functions *******************************************************
 ***********************************************************************/

async function scrapeWebsite(url: string) {
  return {
    content: `Lorem ipsum ${url.length}`,
  };
}

const analyzeSentiment = async (_content: string) => {
  return {
    score: Math.random(),
  };
};
const summarizeWithAI = async (content: string) => {
  return {
    aiSummary: `Lorem ipsum ${content.length}`,
  };
};

const saveToDb = async (_input: {
  websiteUrl: string;
  sentiment: number;
  summary: string;
}) => {
  return {
    status: 'success',
  };
};
