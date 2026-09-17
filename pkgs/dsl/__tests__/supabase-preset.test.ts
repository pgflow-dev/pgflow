import { describe, expect, it } from 'vitest';
import { Flow } from '../src/platforms/supabase.js';
import {
  StepQueueError,
  FlowQueueNameError,
  DuplicateStepSlugError,
  withStepQueues,
} from '../src/platforms/supabase.js';
import * as platformIndex from '../src/platforms/index.js';

/**
 * This test verifies that the Supabase preset Flow provides
 * full autocomplete for all platform resources without needing
 * explicit type annotations.
 */
describe('Supabase Preset Flow', () => {
  it('should provide full autocomplete without type annotations', () => {
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'process' }, async (input, ctx) => {
        // These should all be available with full types
        // without needing to annotate ctx
        void ctx.sql;
        void ctx.supabase;
        void ctx.env;
        void ctx.shutdownSignal;
        
        // This would demonstrate that autocomplete works
        // In an IDE, typing "ctx." would show all these properties
        return { processed: true };
      });

    // The flow should be correctly typed
    void flow;
  });

  it('should allow adding custom resources on top of platform resources', () => {
    interface CustomResources {
      logger: { log: (msg: string) => void };
      cache: { get: (key: string) => string | null };
    }

    const flow = new Flow<{ input: string }, CustomResources>({ slug: 'custom_flow' })
      .step({ slug: 'process' }, async (input, ctx) => {
        // Should have all platform resources
        void ctx.sql;
        void ctx.supabase;
        
        // Plus custom resources
        ctx.logger.log('test');
        ctx.cache.get('key');
        
        return { done: true };
      });

    void flow;
  });
});

describe('step-queue runtime values from platform entries (#651)', () => {
  it('exports StepQueueError and subclasses as runtime values from the Supabase entry', () => {
    // Platform consumers must be able to instanceof-check without importing
    // the root entry: these are values, not just types.
    expect(typeof StepQueueError).toBe('function');
    expect(typeof FlowQueueNameError).toBe('function');
    expect(typeof DuplicateStepSlugError).toBe('function');
    expect(new FlowQueueNameError('f'.repeat(45), 's', 0)).toBeInstanceOf(
      StepQueueError
    );
  });

  it('exports the same runtime values from the shared platform entry', () => {
    expect(typeof platformIndex.StepQueueError).toBe('function');
    expect(typeof platformIndex.withStepQueues).toBe('function');
  });

  it('wraps a Supabase preset flow without losing it', () => {
    const flow = new Flow({ slug: 'step_preset_flow' }).step(
      { slug: 'process' },
      async () => ({ done: true })
    );
    const queued = withStepQueues(flow);
    expect(queued.wrapped).toBe(flow);
    expect(queued.routes[0]?.queueName).toBe('step_preset_flow__process');
  });
});