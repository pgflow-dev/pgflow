import { Flow } from '@pgflow/dsl';
import { simulateFailure } from '../utils.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const sleepWithJitter = (baseMs: number) => {
  const jitter = (Math.random() - 0.5) * 0.4 * baseMs; // ±20%
  return sleep(Math.round(baseMs + jitter));
};

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
    // Simulate website scraping
    await sleepWithJitter(500);
    const endTime = new Date();
    const elapsedMs = endTime.getTime() - startTime.getTime();

    return {
      content: elapsedMs.toString(),
    };
  })
  .step({ slug: 'summary', dependsOn: ['website'] }, async (input) => {
    const startTime = new Date();
    // Simulate AI summarization
    await sleepWithJitter(500);
    const endTime = new Date();
    const elapsedMs = endTime.getTime() - startTime.getTime();

    return elapsedMs.toString();
  })
  .step({ slug: 'tags', dependsOn: ['website'] }, async (input) => {
    const startTime = new Date();

    await simulateFailure(input.run.url);
    // Simulate tag extraction
    await sleepWithJitter(500);

    const endTime = new Date();
    const elapsedMs = endTime.getTime() - startTime.getTime();

    return {
      keywords: [elapsedMs.toString()],
    };
  })
  .step({ slug: 'saveToDb', dependsOn: ['summary', 'tags'] }, async (input) => {
    // Simulate database save operation
    await sleepWithJitter(500);
    
    return {
      id: Math.floor(Math.random() * 1000),
      user_id: input.run.user_id,
      website_url: input.run.url,
      summary: input.summary,
      tags: input.tags.keywords,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });
