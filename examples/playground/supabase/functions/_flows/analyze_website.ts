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
  .step(
    { slug: 'website' },
    async (input) => await scrapeWebsite(input.run.url),
  )
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    async (input) => await summarizeWithAI(input.website.content),
  )
  .step({ slug: 'tags', dependsOn: ['website'] }, async (input) => {
    await simulateFailure(input.run.url);

    const { keywords } = await extractTags(input.website.content);
    return keywords;
  })
  .step(
    { slug: 'saveToDb', dependsOn: ['summary', 'tags'] },
    async (input, { supabase }) => {
      const websiteData = {
        user_id: input.run.user_id,
        website_url: input.run.url,
        summary: input.summary,
        tags: input.tags,
      };
      const { website } = await saveWebsite(websiteData, supabase);

      return website;
    },
  );
