import { Flow } from './new-flow.ts';

// Provide a type for the input of the Flow
type Input = {
  url: string;
};

// noop but async
async function noop(..._args: any[]) {
  return Promise.race([]);
}

const scrapeWebsite = noop;
const analyzeSentiment = noop;
const summarizeWithAI = noop;
const saveToDb = noop;

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
    async (input) =>
      await saveToDb({
        websiteUrl: input.run.url,
        sentiment: input.sentiment.score,
        summary: input.summary,
      }).status
  );
