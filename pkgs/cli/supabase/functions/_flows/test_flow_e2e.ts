import { Flow } from '@pgflow/dsl';

// Test flow for e2e compile tests
export const TestFlowE2E = new Flow<{ value: string }>({
  slug: 'test_flow_e2e',
  maxAttempts: 3,
}).step({ slug: 'step1' }, async (input) => ({
  result: `processed: ${input.run.value}`,
}));

export default TestFlowE2E;
