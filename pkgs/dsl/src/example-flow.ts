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
    async (input) => await scrapeWebsite(input.run.url)
  )
  .step(
    { slug: 'sentiment', dependsOn: ['website'], timeout: 30, maxAttempts: 5 },
    async (input) => await analyzeSentiment(input.website.content)
  )
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    async (input) => await summarizeWithAI(input.website.content)
  )
  .step(
    { slug: 'saveToDb', dependsOn: ['sentiment', 'summary'] },
    async (input) => {
      const results = await saveToDb({
        websiteUrl: input.run.url,
        sentiment: input.sentiment.score,
        summary: input.summary.aiSummary,
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
