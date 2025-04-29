import { Flow } from '@pgflow/dsl';
import scrapeWebsite from '../_tasks/scrapeWebsite.ts';
import convertToCleanMarkdown from '../_tasks/convertToCleanMarkdown.ts';
import analyzeSentiment from '../_tasks/analyzeSentiment.ts';
import summarizeWithAI from '../_tasks/summarizeWithAI.ts';
import saveWebsite from '../_tasks/saveWebsite.ts';

type Input = {
  url: string;
};

export default new Flow<Input>({
  slug: 'analyze_website_v2',
})

  // sdfsdfsdf
  .step(
    { slug: 'website' },
    async (input) => await scrapeWebsite(input.run.url),
  )

  // sdfsdfsdf
  .step(
    { slug: 'markdown', dependsOn: ['website'] },
    async (input) => await convertToCleanMarkdown(input.website.content),
  )

  // sdfsdfsdf
  .step(
    { slug: 'sentiment', dependsOn: ['website'], timeout: 30, maxAttempts: 5 },
    async (input) => await analyzeSentiment(input.website.content),
  )

  // sdfsdfsdf
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    async (input) => await summarizeWithAI(input.website.content),
  )

  // sdfsdfsdf
  .step(
    { slug: 'saveToDb', dependsOn: ['sentiment', 'summary'] },
    async (input) =>
      await saveWebsite({
        websiteUrl: input.run.url,
        sentiment: input.sentiment.score,
        summary: input.summary.aiSummary || '',
      }),
  );
