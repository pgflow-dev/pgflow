import { Flow } from './dsl.js';

/**
 * Simple example flow demonstrating the fanout feature
 * This flow processes an array of numbers in parallel
 */
export const simpleFanoutFlow = new Flow({
  slug: 'simple-fanout',
})
  // Step 1: Create array
  .step(
    { slug: 'create-array', dependsOn: [] },
    async () => {
      return [1, 2, 3, 4, 5];
    }
  )
  // Step 2: Process each number in parallel (fanout)
  .step(
    { 
      slug: 'process-number', 
      dependsOn: ['create-array'] as const, 
      fanout: true,
    },
    async (input: any) => {
      // For fanout steps, input will be { item: number }
      const { item } = input;
      return item * 2;
    }
  )
  // Step 3: Sum results
  .step(
    { slug: 'sum-results', dependsOn: ['process-number'] as const },
    async (input: any) => {
      // For steps depending on fanout, the output will be an array
      const results = input['process-number'];
      return results.reduce((sum: number, n: number) => sum + n, 0);
    }
  );