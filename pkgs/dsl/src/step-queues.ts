import type { AnyFlow } from './dsl.js';
import { validateSlug } from './utils.js';

// ========================
// STEP QUEUE MODE (#651)
// ========================

/**
 * Fixed PGMQ compatibility limit for queue names.
 * pgflow never truncates or hashes names; a name that cannot fit is rejected.
 */
export const MAX_PGMQ_QUEUE_NAME_LENGTH = 47;

/**
 * Deployment metadata, not DAG behavior (#651):
 * - `flow`: every step routes to the default queue `lower(flow_slug)`
 * - `step`: every step gets its own private generated queue
 */
export type QueueMode = 'flow' | 'step';

/**
 * One entry of a checked route snapshot: the resolved canonical queue name
 * for a step at its actual zero-based source index.
 */
export interface StepRoute {
  readonly stepSlug: string;
  readonly stepIndex: number;
  readonly queueName: string;
}

/**
 * Base class for step-queue validation errors thrown synchronously by
 * `withStepQueues()` before any worker or database call.
 */
export class StepQueueError extends Error {
  constructor(
    message: string,
    public readonly flowSlug: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The flow slug cannot fit even the shortest actual index suffix:
 * `lower(flow_slug || '__' || 0)` already exceeds the PGMQ limit, so no
 * per-step queue can ever be derived for this flow.
 *
 * Carries every field the issue requires for a length failure: the flow
 * slug, the failing step slug and its actual zero-based index, both
 * candidate names with their lengths, the shortest required fallback, the
 * maximum, and a concrete shortening hint.
 */
export class FlowQueueNameError extends StepQueueError {
  public readonly stepSlug: string;
  public readonly stepIndex: number;
  public readonly readableName: string;
  public readonly readableLength: number;
  public readonly fallbackName: string;
  public readonly fallbackLength: number;
  public readonly shortestFallback: string;
  public readonly shortestFallbackLength: number;
  public readonly maximum = MAX_PGMQ_QUEUE_NAME_LENGTH;
  public readonly hint: string;

  constructor(flowSlug: string, stepSlug: string, stepIndex: number) {
    const readableName = `${flowSlug}__${stepSlug}`.toLowerCase();
    const fallbackName = `${flowSlug}__${stepIndex}`.toLowerCase();
    const shortestFallback = `${flowSlug}__0`.toLowerCase();
    super(
      `Flow "${flowSlug}" cannot use per-step queues. ` +
        `The shortest required queue "${shortestFallback}" is ${shortestFallback.length} characters; ` +
        `PGMQ allows at most ${MAX_PGMQ_QUEUE_NAME_LENGTH}. ` +
        `Shorten the concrete flow slug or use the default single queue.`,
      flowSlug
    );
    this.stepSlug = stepSlug;
    this.stepIndex = stepIndex;
    this.readableName = readableName;
    this.readableLength = readableName.length;
    this.fallbackName = fallbackName;
    this.fallbackLength = fallbackName.length;
    this.shortestFallback = shortestFallback;
    this.shortestFallbackLength = shortestFallback.length;
    this.hint =
      'Shorten the concrete flow slug or use the default single queue.';
  }
}

/**
 * One step's readable name and actual index fallback name both exceed the
 * PGMQ limit.
 */
export class StepQueueNameError extends StepQueueError {
  public readonly stepSlug: string;
  public readonly stepIndex: number;
  public readonly readableName: string;
  public readonly readableLength: number;
  public readonly fallbackName: string;
  public readonly fallbackLength: number;
  public readonly maximum = MAX_PGMQ_QUEUE_NAME_LENGTH;
  public readonly hint: string;

  constructor(flowSlug: string, stepSlug: string, stepIndex: number) {
    const readableName = `${flowSlug}__${stepSlug}`.toLowerCase();
    const fallbackName = `${flowSlug}__${stepIndex}`.toLowerCase();
    super(
      `Cannot derive a queue for step "${stepSlug}" at index ${stepIndex} in flow "${flowSlug}". ` +
        `The readable name is ${readableName.length} characters and the index fallback is ${fallbackName.length}; ` +
        `PGMQ allows at most ${MAX_PGMQ_QUEUE_NAME_LENGTH}. ` +
        `Shorten the concrete flow slug, shorten the step slug enough for the readable name, ` +
        `or use the default single queue.`,
      flowSlug
    );
    this.stepSlug = stepSlug;
    this.stepIndex = stepIndex;
    this.readableName = readableName;
    this.readableLength = readableName.length;
    this.fallbackName = fallbackName;
    this.fallbackLength = fallbackName.length;
    this.hint =
      'Shorten the concrete flow slug, shorten the step slug enough for the readable name, ' +
      'or use the default single queue.';
  }
}

/**
 * `withStepQueues()` was called on a flow with zero steps. Step mode
 * requires at least one step; an empty flow must keep the default queue.
 */
export class EmptyStepQueuedFlowError extends StepQueueError {
  constructor(flowSlug: string) {
    super(
      `Flow "${flowSlug}" cannot use per-step queues: it has no steps. ` +
        `Per-step queue mode requires at least one step.`,
      flowSlug
    );
  }
}

/**
 * Two steps of one flow have the same normalized slug.
 */
export class DuplicateStepSlugError extends StepQueueError {
  public readonly stepSlug: string;
  public readonly otherStepSlug: string;
  public readonly normalizedStepSlug: string;

  constructor(flowSlug: string, otherStepSlug: string, stepSlug: string) {
    super(
      `Steps "${otherStepSlug}" and "${stepSlug}" in flow "${flowSlug}" ` +
        'conflict case-insensitively: step slugs must be unique case-insensitively.',
      flowSlug
    );
    this.stepSlug = stepSlug;
    this.otherStepSlug = otherStepSlug;
    this.normalizedStepSlug = stepSlug.toLowerCase();
  }
}

/**
 * Defensive route-level check. A valid flow cannot reach this error because
 * normalized step slugs are checked before route resolution.
 */
export class DuplicateQueueRouteError extends StepQueueError {
  public readonly queueName: string;
  public readonly stepSlug: string;
  public readonly otherStepSlug: string;

  constructor(
    flowSlug: string,
    otherStepSlug: string,
    stepSlug: string,
    queueName: string
  ) {
    super(
      `Steps "${otherStepSlug}" and "${stepSlug}" in flow "${flowSlug}" ` +
        `both resolve to queue "${queueName}": generated queue names must be unique per flow.`,
      flowSlug
    );
    this.queueName = queueName;
    this.stepSlug = stepSlug;
    this.otherStepSlug = otherStepSlug;
  }
}

function checkNormalizedStepSlugs(flow: AnyFlow): void {
  const seen = new Map<string, string>();
  for (const stepSlug of flow.stepOrder) {
    const normalizedStepSlug = stepSlug.toLowerCase();
    const otherStepSlug = seen.get(normalizedStepSlug);
    if (otherStepSlug !== undefined) {
      throw new DuplicateStepSlugError(flow.slug, otherStepSlug, stepSlug);
    }
    seen.set(normalizedStepSlug, stepSlug);
  }
}

/**
 * Canonical per-step queue-name resolution, mirroring the authoritative SQL
 * resolver (#651):
 *
 * ```text
 * readable = lower(flow_slug || '__' || step_slug)
 * fallback = lower(flow_slug || '__' || step_index)
 * ```
 *
 * Resolution: readable when it fits; otherwise the actual-index fallback
 * when it fits; otherwise the complete flow is rejected (never truncated or
 * hashed).
 *
 * @throws FlowQueueNameError when even `flow__0` exceeds the limit
 * @throws StepQueueNameError when this step's readable and fallback both exceed
 */
export function resolveStepQueueName(
  flowSlug: string,
  stepSlug: string,
  stepIndex: number
): string {
  validateSlug(flowSlug);
  validateSlug(stepSlug);

  const readable = `${flowSlug}__${stepSlug}`.toLowerCase();
  if (readable.length <= MAX_PGMQ_QUEUE_NAME_LENGTH) {
    return readable;
  }

  if (`${flowSlug}__0`.length > MAX_PGMQ_QUEUE_NAME_LENGTH) {
    throw new FlowQueueNameError(flowSlug, stepSlug, stepIndex);
  }

  const fallback = `${flowSlug}__${stepIndex}`.toLowerCase();
  if (fallback.length <= MAX_PGMQ_QUEUE_NAME_LENGTH) {
    return fallback;
  }

  throw new StepQueueNameError(flowSlug, stepSlug, stepIndex);
}

/**
 * Module-private construction token: only {@link withStepQueues} can build a
 * checked wrapper, so its validation cannot be bypassed by constructing
 * `StepQueuedFlow` directly with forged routes (#651).
 */
const stepQueueConstructionToken = Symbol('pgflow.stepQueueConstruction');

/**
 * Checked route snapshot wrapper produced by `withStepQueues()`.
 *
 * Deployment metadata only: the wrapped `Flow` keeps its exact type, step
 * union, handler inference, dependencies, conditions, skippability, and
 * environment/context requirements. No extra brand hierarchy.
 */
export class StepQueuedFlow<TFlow extends AnyFlow = AnyFlow> {
  /** Internal runtime discriminant; do not construct or rely on manually. */
  readonly isStepQueuedFlow = true as const;
  readonly wrapped: TFlow;
  /** Checked, frozen route snapshot ordered by source step order. */
  readonly routes: readonly StepRoute[];

  /** Constructed by {@link withStepQueues}; not part of the public API. */
  constructor(
    token: typeof stepQueueConstructionToken,
    wrapped: TFlow,
    routes: readonly StepRoute[]
  ) {
    if (token !== stepQueueConstructionToken) {
      throw new StepQueueError(
        'StepQueuedFlow cannot be constructed directly: use withStepQueues() to validate and build the checked routes.',
        wrapped?.slug ?? 'unknown'
      );
    }
    this.wrapped = wrapped;
    // Defensive copy, deeply frozen: later mutation of the caller's array or
    // route objects cannot diverge the checked snapshot, and the wrapper
    // itself is frozen (#651).
    this.routes = Object.freeze(
      routes.map((route) => Object.freeze({ ...route }))
    );
    Object.freeze(this);
  }
}

/**
 * Marks a flow for per-step private queues (#651).
 *
 * Validates synchronously, before any worker or database call, that every
 * generated queue name resolves within the PGMQ limit and that normalized
 * step slugs are unique.
 *
 * @throws EmptyStepQueuedFlowError for a flow with zero steps
 * @throws FlowQueueNameError / StepQueueNameError for names that cannot fit
 * @throws DuplicateStepSlugError for case-only duplicate step slugs
 */
export function withStepQueues<TFlow extends AnyFlow>(
  flow: TFlow
): StepQueuedFlow<TFlow> {
  if (flow.stepOrder.length === 0) {
    throw new EmptyStepQueuedFlowError(flow.slug);
  }

  // Check normalized slugs before name resolution. Long case-only variants
  // can resolve to different index fallbacks, so a route-name collision check
  // alone cannot reject them.
  checkNormalizedStepSlugs(flow);

  const routes: StepRoute[] = flow.stepOrder.map((stepSlug, stepIndex) => ({
    stepSlug,
    stepIndex,
    queueName: resolveStepQueueName(flow.slug, stepSlug, stepIndex),
  }));

  const seen = new Map<string, string>();
  for (const route of routes) {
    const otherStepSlug = seen.get(route.queueName);
    if (otherStepSlug !== undefined) {
      throw new DuplicateQueueRouteError(
        flow.slug,
        otherStepSlug,
        route.stepSlug,
        route.queueName
      );
    }
    seen.set(route.queueName, route.stepSlug);
  }

  return new StepQueuedFlow(stepQueueConstructionToken, flow, routes);
}

/**
 * Runtime type guard for the `StepQueuedFlow` wrapper.
 */
export function isStepQueuedFlow<F extends AnyFlow>(
  flow: F | StepQueuedFlow<F>
): flow is StepQueuedFlow<F> {
  return flow instanceof StepQueuedFlow;
}

/**
 * Derives the complete ordered route map for a flow under a queue mode,
 * mirroring the SQL derivation (#651). `flow` mode routes every step to the
 * default queue `lower(flow_slug)`; `step` mode resolves each step through
 * the canonical per-step resolver.
 */
export function resolveQueueRouteMap(
  flow: AnyFlow,
  queueMode: QueueMode
): readonly StepRoute[] {
  checkNormalizedStepSlugs(flow);

  return flow.stepOrder.map((stepSlug, stepIndex) => ({
    stepSlug,
    stepIndex,
    queueName:
      queueMode === 'step'
        ? resolveStepQueueName(flow.slug, stepSlug, stepIndex)
        : flow.slug.toLowerCase(),
  }));
}
