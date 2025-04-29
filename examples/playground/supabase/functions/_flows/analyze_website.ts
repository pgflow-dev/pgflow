import { Flow } from '@pgflow/dsl';
import scrapeWebsite from '../_tasks/scrapeWebsite.ts';
import analyzeSentiment from '../_tasks/analyzeSentiment.ts';
import summarizeWithAI from '../_tasks/summarizeWithAI.ts';
import saveWebsite from '../_tasks/saveWebsite.ts';

type Input = {
  url: string;
};

export default new Flow<Input>({
  slug: 'analyze_website',
})
  .step(
    { slug: 'website' },
    async (input) => await scrapeWebsite(input.run.url),
  )
  .step(
    { slug: 'sentiment', dependsOn: ['website'], timeout: 30, maxAttempts: 5 },
    async (input) => await analyzeSentiment(input.website.content),
  )
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    async (input) => await summarizeWithAI(input.website.content),
  )
  .step(
    { slug: 'saveToDb', dependsOn: ['sentiment', 'summary'] },
    async (input) =>
      await saveWebsite({
        websiteUrl: input.run.url,
        sentiment: input.sentiment.score,
        summary: input.summary.aiSummary,
      }),
  );
