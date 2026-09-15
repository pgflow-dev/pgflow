import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import {
  withStepQueues,
  isStepQueuedFlow,
  StepQueuedFlow,
  resolveStepQueueName,
  resolveQueueRouteMap,
  MAX_PGMQ_QUEUE_NAME_LENGTH,
  FlowQueueNameError,
  StepQueueNameError,
  EmptyStepQueuedFlowError,
  DuplicateStepSlugError,
} from '../../src/step-queues.js';
import type { StepRoute } from '../../src/step-queues.js';

describe('resolveStepQueueName', () => {
  it('derives the readable lowercase name', () => {
    expect(resolveStepQueueName('communityThreadsV1', 'classify', 0)).toBe(
      'communitythreadsv1__classify'
    );
  });

  it('falls back to the actual zero-based index when readable is too long', () => {
    // 14-char flow + 40-char step = readable 56 chars > 47
    const longStep = 'a'.repeat(40);
    expect(resolveStepQueueName('shortFlow', longStep, 3)).toBe('shortflow__3');
  });

  it('uses readable at index boundaries when it fits', () => {
    // 44-char flow, 1-char step: readable = 44+3 = 47, fits exactly
    const flow44 = 'f'.repeat(44);
    expect(resolveStepQueueName(flow44, 's', 10)).toBe(`${flow44}__s`);
  });

  it('uses the index fallback when the flow is 44 chars and index fits', () => {
    // readable too long, fallback flow__9 = 44+3 = 47 fits
    const flow44 = 'f'.repeat(44);
    const longStep = 's'.repeat(20);
    expect(resolveStepQueueName(flow44, longStep, 9)).toBe(`${flow44}__9`);
  });

  it('rejects a step whose readable and fallback names both exceed 47', () => {
    const flow44 = 'f'.repeat(44);
    const longStep = 's'.repeat(20);
    // fallback flow__10 = 44+4 = 48 > 47
    const error = (() => {
      try {
        resolveStepQueueName(flow44, longStep, 10);
      } catch (e) {
        return e as StepQueueNameError;
      }
      throw new Error('expected StepQueueNameError');
    })();

    expect(error).toBeInstanceOf(StepQueueNameError);
    expect(error.stepSlug).toBe(longStep);
    expect(error.stepIndex).toBe(10);
    expect(error.readableName).toBe(`${flow44}__${longStep}`.toLowerCase());
    expect(error.readableLength).toBe(66);
    expect(error.fallbackName).toBe(`${flow44}__10`);
    expect(error.fallbackLength).toBe(48);
    expect(error.maximum).toBe(MAX_PGMQ_QUEUE_NAME_LENGTH);
    expect(error.message).toContain('Shorten the concrete flow slug');
  });

  it('rejects a 45-character flow because even flow__0 exceeds 47', () => {
    const flow45 = 'f'.repeat(45);
    const error = (() => {
      try {
        resolveStepQueueName(flow45, 's', 0);
      } catch (e) {
        return e as FlowQueueNameError;
      }
      throw new Error('expected FlowQueueNameError');
    })();

    expect(error).toBeInstanceOf(FlowQueueNameError);
    expect(error.flowSlug).toBe(flow45);
    expect(error.stepSlug).toBe('s');
    expect(error.stepIndex).toBe(0);
    expect(error.readableName).toBe(`${flow45}__s`.toLowerCase());
    expect(error.readableLength).toBe(48);
    expect(error.fallbackName).toBe(`${flow45}__0`);
    expect(error.fallbackLength).toBe(48);
    expect(error.shortestFallback).toBe(`${flow45}__0`);
    expect(error.shortestFallbackLength).toBe(48);
    expect(error.maximum).toBe(MAX_PGMQ_QUEUE_NAME_LENGTH);
    expect(error.hint).toContain('Shorten the concrete flow slug');
    expect(error.message).toContain('cannot use per-step queues');
  });

  it('never truncates or hashes', () => {
    expect(() => resolveStepQueueName('f'.repeat(46), 's', 0)).toThrowError(
      FlowQueueNameError
    );
  });
});

function makeStepQueuedFlow(slug: string, stepSlugs: string[]) {
  let flow = new Flow<Json0>({ slug });
  for (const step of stepSlugs) {
    flow = flow.step({ slug: step }, async () => 1) as typeof flow;
  }
  return flow;
}

// Minimal JSON input type alias to keep helpers readable
type Json0 = number;

describe('withStepQueues', () => {
  it('returns a checked wrapper preserving the exact step union', () => {
    const flow = makeStepQueuedFlow('communityThreadsV1', [
      'classify',
      'deliverSlack',
    ]);
    const queued = withStepQueues(flow);

    expect(isStepQueuedFlow(queued)).toBe(true);
    expect(queued.wrapped).toBe(flow);
    expect(queued.routes.map((r: StepRoute) => r.queueName)).toEqual([
      'communitythreadsv1__classify',
      'communitythreadsv1__deliverslack',
    ]);
  });

  it('rejects a flow with zero steps with a typed error', () => {
    const flow = new Flow<number>({ slug: 'emptyFlow' });
    expect(() => withStepQueues(flow)).toThrowError(EmptyStepQueuedFlowError);
    try {
      withStepQueues(flow);
    } catch (e) {
      expect((e as EmptyStepQueuedFlowError).flowSlug).toBe('emptyFlow');
    }
  });

  it('rejects duplicate normalized step slugs before route resolution', () => {
    // Constructed directly to bypass Flow's own case-insensitive duplicate
    // check; the wrapper must still reject the malformed definition.
    const flow = new Flow<number>(
      { slug: 'dupeFlow' },
      {
        A: {
          slug: 'A',
          handler: async () => 1,
          dependencies: [],
          options: {},
        },
        a: {
          slug: 'a',
          handler: async () => 1,
          dependencies: [],
          options: {},
        },
      },
      ['A', 'a']
    );

    expect(() => withStepQueues(flow)).toThrowError(DuplicateStepSlugError);
    try {
      withStepQueues(flow);
    } catch (e) {
      const error = e as DuplicateStepSlugError;
      expect(error.normalizedStepSlug).toBe('a');
      expect(error.otherStepSlug).toBe('A');
      expect(error.stepSlug).toBe('a');
    }
  });

  it('rejects long case-only duplicates before their index fallbacks differ', () => {
    const flowSlug = 'f'.repeat(44);
    const firstStep = `A${'s'.repeat(19)}`;
    const secondStep = `a${'s'.repeat(19)}`;
    const flow = new Flow<number>(
      { slug: flowSlug },
      {
        [firstStep]: {
          slug: firstStep,
          handler: async () => 1,
          dependencies: [],
          options: {},
        },
        [secondStep]: {
          slug: secondStep,
          handler: async () => 1,
          dependencies: [],
          options: {},
        },
      },
      [firstStep, secondStep]
    );

    // Readable names are 66 chars. Route resolution would otherwise use the
    // distinct `flow__0` and `flow__1` fallbacks and miss this duplicate.
    expect(() => withStepQueues(flow)).toThrowError(DuplicateStepSlugError);
    try {
      withStepQueues(flow);
    } catch (e) {
      const error = e as DuplicateStepSlugError;
      expect(error.otherStepSlug).toBe(firstStep);
      expect(error.stepSlug).toBe(secondStep);
    }
  });

  it('freezes the checked route snapshot against mutation', () => {
    const queued = withStepQueues(
      makeStepQueuedFlow('freezeFlow', ['one', 'two'])
    );

    expect(Object.isFrozen(queued.routes)).toBe(true);
    expect(Object.isFrozen(queued.routes[0])).toBe(true);
    expect(Object.isFrozen(queued)).toBe(true);
    expect(() => {
      (queued.routes as unknown as StepRoute[]).push({
        stepSlug: 'x',
        stepIndex: 2,
        queueName: 'freezeflow__x',
      });
    }).toThrowError(TypeError);
  });

  it('cannot be constructed directly with forged routes (#651)', () => {
    const flow = makeStepQueuedFlow('tokenFlow', ['a']);
    const queued = withStepQueues(flow);

    // The construction token is module-private: any external call to the
    // constructor is rejected, so validation cannot be bypassed.
    const Forged = queued.constructor as new (
      token: symbol,
      wrapped: unknown,
      routes: StepRoute[]
    ) => StepQueuedFlow;
    expect(() => {
      new Forged(
        Symbol('forged'),
        flow,
        []
      );
    }).toThrowError(
      'StepQueuedFlow cannot be constructed directly: use withStepQueues() to validate and build the checked routes.'
    );
  });

  it('throws typed errors before any worker or database call', () => {
    // Long flow slug: construction of the wrapper must fail synchronously.
    const flow = new Flow<number>({ slug: 'f'.repeat(45) }).step(
      { slug: 's' },
      async () => 1
    );
    expect(() => withStepQueues(flow)).toThrowError(FlowQueueNameError);
  });
});

describe('Flow.stepOrder immutability (#651)', () => {
  it('is actually immutable: push throws and does not change the array', () => {
    const flow = makeStepQueuedFlow('immutableFlow', ['a', 'b']);

    expect(() => {
      (flow.stepOrder as unknown as string[]).push('c');
    }).toThrowError(TypeError);
    expect(flow.stepOrder).toEqual(['a', 'b']);

    expect(() => {
      (flow.stepOrder as unknown as string[]).reverse();
    }).toThrowError(TypeError);
    expect(flow.stepOrder).toEqual(['a', 'b']);
  });

  it('gives each new Flow instance an independent frozen copy', () => {
    const base = makeStepQueuedFlow('copyFlow', ['a']);
    const extended = base.step({ slug: 'b' }, async () => 1);

    expect(extended.stepOrder).toEqual(['a', 'b']);
    expect(base.stepOrder).toEqual(['a']);
    expect(() => {
      (extended.stepOrder as unknown as string[]).pop();
    }).toThrowError(TypeError);
  });
});

describe('case-insensitive step duplicates within a flow (#651)', () => {
  it('rejects case-only duplicate step slugs in .step()', () => {
    const flow = new Flow<number>({ slug: 'caseFlow' }).step(
      { slug: 'Classify' },
      async () => 1
    );

    expect(() => flow.step({ slug: 'classify' }, async () => 1)).toThrowError(
      DuplicateStepSlugError
    );
  });

  it('rejects case-only duplicate step slugs in .map()', () => {
    const flow = new Flow<number[]>({ slug: 'caseMapFlow' }).step(
      { slug: 'Scan' },
      async () => [1]
    );

    expect(() => flow.map({ slug: 'scan', array: 'Scan' }, async (x) => x)).toThrowError(
      DuplicateStepSlugError
    );
  });
});

describe('resolveQueueRouteMap', () => {
  it('routes every step to the default queue in flow mode', () => {
    const flow = makeStepQueuedFlow('MyFlow', ['one', 'two']);
    expect(
      resolveQueueRouteMap(flow, 'flow').map((r) => r.queueName)
    ).toEqual(['myflow', 'myflow']);
  });

  it('resolves per-step queues in step mode', () => {
    const flow = makeStepQueuedFlow('MyFlow', ['one', 'two']);
    expect(
      resolveQueueRouteMap(flow, 'step').map((r) => r.queueName)
    ).toEqual(['myflow__one', 'myflow__two']);
  });
});
