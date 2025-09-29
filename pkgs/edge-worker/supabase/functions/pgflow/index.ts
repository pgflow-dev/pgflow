import { Flow } from '@pgflow/dsl';
import { ControlPlane } from '@pgflow/edge-worker';

// Test flows for e2e testing
const TestFlow1 = new Flow({ slug: 'test_flow_1' }).step(
  { slug: 'step1' },
  () => ({ result: 'ok' })
);

const TestFlow2 = new Flow({ slug: 'test_flow_2' })
  .step({ slug: 'step1' }, () => ({ value: 1 }))
  .step({ slug: 'step2', dependsOn: ['step1'] }, () => ({ value: 2 }));

const TestFlow3 = new Flow({ slug: 'test_flow_3', maxAttempts: 5 }).step(
  { slug: 'step1' },
  () => ({ done: true })
);

ControlPlane.serve([TestFlow1, TestFlow2, TestFlow3]);
