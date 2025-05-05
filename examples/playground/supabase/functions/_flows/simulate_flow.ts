import { Flow } from '@pgflow/dsl';
import { sleep } from '../utils.ts';

// Simulation configuration types
export type StepConfig = {
  sleep: number;      // milliseconds to sleep
  failureChance: number;  // 0-100 percentage
};

type SimulationConfig = {
  website?: StepConfig;
  sentiment?: StepConfig;
  summary?: StepConfig;
  tags?: StepConfig;
  saveToDb?: StepConfig;
};

type Input = {
  user_id: string;
  simulation_config: SimulationConfig;
};

// Helper function to simulate work and potential failure
async function simulateWork(config?: StepConfig): Promise<void> {
  if (!config) return;
  
  // Sleep to simulate work
  if (config.sleep > 0) {
    await sleep(config.sleep);
  }
  
  // Possibly fail based on chance
  if (config.failureChance > 0) {
    const randomValue = Math.random() * 100;
    if (randomValue < config.failureChance) {
      throw new Error(`Simulated failure (${config.failureChance}% chance)`);
    }
  }
}

export default new Flow<Input>({
  slug: 'simulate_flow',
  maxAttempts: 5,   // Increased from 3 to 5
  timeout: 4,
  baseDelay: 1,     // Kept at 1 as requested
})
  .step(
    { slug: 'website' },
    async (input) => {
      await simulateWork(input.run.simulation_config.website);
      // Return the same shape as the real scrapeWebsite function
      return {
        title: 'Simulated Website Title',
        content: 'This is simulated website content for testing purposes.',
        url: 'https://simulation.example.com',
      };
    },
  )
  .step({ slug: 'sentiment', dependsOn: ['website'] }, async (input) => {
    await simulateWork(input.run.simulation_config.sentiment);
    // Return the same shape as the real analyzeSentiment function
    return {
      score: Math.random() * 2 - 1, // Random value between -1 and 1
      magnitude: Math.random() * 5,
      language: 'en',
    };
  })
  .step(
    { slug: 'summary', dependsOn: ['website'] },
    async (input) => {
      await simulateWork(input.run.simulation_config.summary);
      // Return the same shape as the real summarizeWithAI function
      return {
        aiSummary: 'This is a simulated AI summary for testing the flow system.',
      };
    },
  )
  .step({ slug: 'tags', dependsOn: ['website'] }, async (input) => {
    await simulateWork(input.run.simulation_config.tags);
    // Return the same shape as the real extractTags function
    return ['simulation', 'testing', 'pgflow', 'example'];
  })
  .step(
    { slug: 'saveToDb', dependsOn: ['sentiment', 'summary', 'tags'] },
    async (input) => {
      await simulateWork(input.run.simulation_config.saveToDb);
      
      // Create simulated website data with the same structure
      const website = {
        id: crypto.randomUUID(),
        user_id: input.run.user_id,
        website_url: 'https://simulation.example.com',
        sentiment: input.sentiment.score,
        summary: input.summary.aiSummary,
        tags: input.tags,
        created_at: new Date().toISOString(),
      };
      
      return website;
    },
  );