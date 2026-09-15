import {
  isStepQueuedFlow,
  type AnyFlow,
  type QueueMode,
  type StepQueuedFlow,
  type StepRoute,
} from '@pgflow/dsl';

/**
 * Complete queue routing for one flow worker (#651): deployment metadata the
 * worker polls, claims, registers, and compiles with.
 */
export interface WorkerRouting {
  readonly flow: AnyFlow;
  readonly queueMode: QueueMode;
  /** Canonical queue this worker polls (persisted route spelling). */
  readonly queueName: string;
  /** Exact step selector; present only in step mode. */
  readonly stepSlug?: string;
  /** Complete ordered route map sent to ensure_flow_compiled for verification. */
  readonly routes: readonly StepRoute[];
}

/**
 * Resolves and validates worker routing before any adapter or database call
 * (#651). Runtime rules, enforced for direct callers as well as
 * EdgeWorker.start():
 * - a plain Flow keeps the default queue lower(slug) and rejects a supplied
 *   stepSlug rather than silently ignoring it;
 * - a StepQueuedFlow requires a stepSlug that exists in its checked route
 *   snapshot; unknown or missing values throw typed errors;
 * - step-queued workers poll exactly their step's queue and claim only their
 *   exact flow-step pair.
 */
export function resolveWorkerRouting<TFlow extends AnyFlow>(
  flow: TFlow | StepQueuedFlow<TFlow>,
  stepSlug: string | undefined
): WorkerRouting {
  if (isStepQueuedFlow<TFlow>(flow)) {
    if (stepSlug === undefined) {
      throw new Error(
        `Flow "${flow.wrapped.slug}" uses per-step queues: stepSlug is required in the worker config. ` +
          `Valid step slugs: ${flow.routes.map((r) => r.stepSlug).join(', ')}.`
      );
    }

    const route = flow.routes.find((r) => r.stepSlug === stepSlug);
    if (route === undefined) {
      throw new Error(
        `Step "${stepSlug}" does not exist in step-queued flow "${flow.wrapped.slug}". ` +
          `Valid step slugs: ${flow.routes.map((r) => r.stepSlug).join(', ')}.`
      );
    }

    return {
      flow: flow.wrapped,
      queueMode: 'step',
      queueName: route.queueName,
      stepSlug: route.stepSlug,
      routes: flow.routes,
    };
  }

  if (stepSlug !== undefined) {
    throw new Error(
      `Flow "${flow.slug}" uses the default flow queue: stepSlug is not allowed. ` +
        `Wrap the flow with withStepQueues() to use per-step queues.`
    );
  }

  const queueName = flow.slug.toLowerCase();

  return {
    flow,
    queueMode: 'flow',
    queueName,
    routes: flow.stepOrder.map((slug, stepIndex) => ({
      stepSlug: slug,
      stepIndex,
      queueName,
    })),
  };
}
