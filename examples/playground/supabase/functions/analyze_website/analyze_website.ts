import { Flow } from '@pgflow/dsl';
import { Database } from '../database-types.d.ts';

type WebsiteRow = Database['public']['Tables']['websites']['Row'];

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
      await saveToDb({
        websiteUrl: input.run.url,
        sentiment: input.sentiment.score,
        summary: input.summary.aiSummary,
      }),
  );

/***********************************************************************
 ****** functions *******************************************************
 ***********************************************************************/

async function scrapeWebsite(url: string) {
  return {
    content: `Lorem ipsum ${url.length}`,
  };

  // const response = await fetch(url);
  //
  // if (!response.ok) {
  //   throw new Error(`Failed to fetch website: ${response.status}`);
  // }
  //
  // return await response.text();
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

import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
);

const saveToDb = async (input: {
  websiteUrl: string;
  sentiment: number;
  summary: string;
}) => {
  const { data } = await supabase
    .from('websites')
    .insert([
      {
        website_url: input.websiteUrl,
        sentiment: input.sentiment,
        summary: input.summary,
      },
    ])
    .select('*')
    .single()
    .throwOnError();
  console.log('results', data);

  return { success: true, website: data };
};
