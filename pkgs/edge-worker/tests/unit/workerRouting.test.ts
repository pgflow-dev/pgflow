import { assert, assertEquals, assertThrows } from '@std/assert';
import { Flow, withStepQueues } from '@pgflow/dsl';
import { resolveWorkerRouting } from '../../src/flow/workerRouting.ts';

const StepFlow = new Flow<number>({ slug: 'communityThreadsV1' })
  .step({ slug: 'classify' }, () => 'help')
  .step(
    { slug: 'deliverSlack', dependsOn: ['classify'] },
    () => 'sent'
  );

const QueuedFlow = withStepQueues(StepFlow);

Deno.test('resolveWorkerRouting - plain flow keeps the default queue and flow mode', () => {
  const routing = resolveWorkerRouting(StepFlow, undefined);

  assertEquals(routing.queueMode, 'flow');
  assertEquals(routing.queueName, 'communitythreadsv1');
  assertEquals(routing.stepSlug, undefined);
  assertEquals(
    routing.routes.map((r) => r.queueName),
    ['communitythreadsv1', 'communitythreadsv1']
  );
  assert(routing.flow === StepFlow);
});

Deno.test('resolveWorkerRouting - plain flow rejects a supplied stepSlug', () => {
  const error = assertThrows(
    () => resolveWorkerRouting(StepFlow, 'classify'),
    Error
  );
  assert(
    error.message.includes(
      'Flow "communityThreadsV1" uses the default flow queue: stepSlug is not allowed'
    ),
    `unexpected message: ${error.message}`
  );
});

Deno.test('resolveWorkerRouting - step-queued flow requires a stepSlug', () => {
  const error = assertThrows(
    () => resolveWorkerRouting(QueuedFlow, undefined),
    Error
  );
  assert(
    error.message.includes('stepSlug is required'),
    `unexpected message: ${error.message}`
  );
  assert(error.message.includes('classify'));
  assert(error.message.includes('deliverSlack'));
});

Deno.test('resolveWorkerRouting - step-queued flow rejects an unknown stepSlug', () => {
  const error = assertThrows(
    () => resolveWorkerRouting(QueuedFlow, 'nonexistentStep'),
    Error
  );
  assert(
    error.message.includes(
      'Step "nonexistentStep" does not exist in step-queued flow "communityThreadsV1"'
    ),
    `unexpected message: ${error.message}`
  );
});

Deno.test('resolveWorkerRouting - step-queued flow resolves the exact step queue', () => {
  const routing = resolveWorkerRouting(QueuedFlow, 'deliverSlack');

  assertEquals(routing.queueMode, 'step');
  assertEquals(routing.queueName, 'communitythreadsv1__deliverslack');
  assertEquals(routing.stepSlug, 'deliverSlack');
  assertEquals(routing.routes.length, 2);
  assert(routing.flow === StepFlow);
});

Deno.test('resolveWorkerRouting - case-sensitive step selection', () => {
  assertThrows(() => resolveWorkerRouting(QueuedFlow, 'Classify'), Error);
});

Deno.test('createFlowWorker - validates step routing before sql requirements', async () => {
  const { createFlowWorker } = await import('../../src/flow/createFlowWorker.ts');
  const noopLogger = () => ({
    debug: () => {}, verbose: () => {}, info: () => {}, warn: () => {}, error: () => {},
    taskStarted: () => {}, taskCompleted: () => {}, taskFailed: () => {},
    polling: () => {}, taskCount: () => {}, startupBanner: () => {}, shutdown: () => {},
  });

  // Plain flow with stepSlug: routing error wins over the sql/connection check
  let error = await (() => {
    try {
      createFlowWorker(StepFlow, { stepSlug: 'classify' } as never, noopLogger, {} as never);
      return Promise.resolve(null);
    } catch (e) {
      return Promise.resolve(e as Error);
    }
  })();
  assert(error !== null, 'expected a routing error');
  assert(error.message.includes('stepSlug is not allowed'), error.message);

  // Step-queued flow without stepSlug
  error = await (() => {
    try {
      createFlowWorker(QueuedFlow, {} as never, noopLogger, {} as never);
      return Promise.resolve(null);
    } catch (e) {
      return Promise.resolve(e as Error);
    }
  })();
  assert(error !== null, 'expected a routing error');
  assert(error.message.includes('stepSlug is required'), error.message);
});
