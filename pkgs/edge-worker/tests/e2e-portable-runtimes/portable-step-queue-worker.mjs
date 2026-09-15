// Portable step-queue worker fixture (#651): runs one withStepQueues()
// flow worker for the step named by PORTABLE_STEP_SLUG under Node or Bun.
// Mirrors the deployed Deno flow in supabase/functions/_shared/step_queue_flow.ts.
import { Flow, withStepQueues } from '@pgflow/dsl';
import { EdgeWorker } from '../../dist/index.js';
import process from 'node:process';

const stepSlug = process.env.PORTABLE_STEP_SLUG;

if (!stepSlug) {
  throw new Error('PORTABLE_STEP_SLUG is required');
}

const flow = withStepQueues(
  new Flow({ slug: 'portableStepQueues' })
    .step({ slug: 'first' }, (flowInput) => ({
      value: flowInput.value + 1,
    }))
    .step({ slug: 'second', dependsOn: ['first'] }, (deps) => ({
      value: deps.first.value * 2,
    }))
);

await EdgeWorker.start(flow, { stepSlug });

console.log(`portable step worker started: ${flow.wrapped.slug}#${stepSlug}`);
