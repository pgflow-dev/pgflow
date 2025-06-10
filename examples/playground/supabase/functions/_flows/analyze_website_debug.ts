import { Flow } from '@pgflow/dsl';
import scrapeWebsite from '../_tasks/scrapeWebsite.ts';
import summarizeWithAI from '../_tasks/summarizeWithAI.ts';
import extractTags from '../_tasks/extractTags.ts';
import saveWebsite from '../_tasks/saveWebsite.ts';
import { simulateFailure } from '../utils.ts';

type Input = {
  url: string;
  user_id: string;
};

export default new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 3,
  timeout: 4,
  baseDelay: 1,
})
  .step({ slug: 'website' }, async (input) => {
    const startTime = new Date();
    const results = await scrapeWebsite(input.run.url);
    const endTime = new Date();
    const elapsedMs = endTime.getTime() - startTime.getTime();

    return {
      content: elapsedMs.toString(),
    };
  })
  .step({ slug: 'summary', dependsOn: ['website'] }, async (input) => {
    const startTime = new Date();
    await summarizeWithAI(input.website.content);
    const endTime = new Date();
    const elapsedMs = endTime.getTime() - startTime.getTime();

    return elapsedMs.toString();
  })
  .step({ slug: 'tags', dependsOn: ['website'] }, async (input) => {
    const startTime = new Date();

    await simulateFailure(input.run.url);
    const { keywords } = await extractTags(input.website.content);

    const endTime = new Date();
    const elapsedMs = endTime.getTime() - startTime.getTime();

    return {
      keywords: [elapsedMs.toString()],
    };
  })
  .step({ slug: 'saveToDb', dependsOn: ['summary', 'tags'] }, async (input) => {
    const websiteData = {
      user_id: input.run.user_id,
      website_url: input.run.url,
      summary: input.summary,
      tags: input.tags.keywords,
    };
    const { website } = await saveWebsite(websiteData);

    return website;
  });
