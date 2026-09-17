import { Flow, withStepQueues } from '@pgflow/dsl';

export const stepQueueE2EFlow = withStepQueues(
  new Flow<{ value: number }>({ slug: 'e2eStepQueues' })
    .step({ slug: 'first' }, (flowInput) => ({
      value: flowInput.value + 1,
    }))
    .step({ slug: 'second', dependsOn: ['first'] }, (deps) => ({
      value: deps.first.value * 2,
    }))
);
