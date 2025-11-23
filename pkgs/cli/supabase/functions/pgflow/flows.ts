import { Flow } from '@pgflow/dsl';

// Test flow for E2E testing of compile command
// This flow is used by the CLI E2E tests to verify that the compile command works correctly
const TestFlow = new Flow({ slug: 'test_flow_e2e' })
  .step({ slug: 'step1' }, () => ({ result: 'done' }));

// Export flows array for ControlPlane
export const flows = [TestFlow];
