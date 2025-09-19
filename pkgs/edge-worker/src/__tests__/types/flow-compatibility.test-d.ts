import { describe, it } from 'vitest';
import { Flow } from '@pgflow/dsl';
import { EdgeWorker } from '../../EdgeWorker.js';

describe('Flow Compatibility Type Tests', () => {
  it('should accept flows that only use platform resources', () => {
    const flow = new Flow({ slug: 'platform_only' })
      .step({ slug: 'query' }, () => {
        return { result: 'data' };
      })
      .step({ slug: 'auth' }, () => {
        return { authenticated: true };
      });

    // This should compile without errors
    EdgeWorker.start(flow);
  });

  it('should accept flows with base context only', () => {
    const flow = new Flow({ slug: 'base_only' })
      .step({ slug: 'process' }, (_input, ctx) => {
        // Only uses env and shutdownSignal from base context
        console.log(ctx.env.SOME_VAR);
        return { processed: true };
      });

    // This should compile without errors
    EdgeWorker.start(flow);
  });

  it('should reject flows that require non-platform resources', () => {
    const flow = new Flow({ slug: 'custom_resource' })
      .step({ slug: 'cache' }, () => {
        return { cached: true };
      });

    // @ts-expect-error - Flow requires redis which platform doesn't provide
    EdgeWorker.start(flow);
  });

  it('should work with mixed platform resources', () => {
    const flow = new Flow({ slug: 'mixed_platform' })
      .step({ slug: 'query' }, () => {
        return { data: [] };
      })
      .step({ slug: 'store' }, () => {
        return { stored: true };
      });

    // This should compile without errors
    EdgeWorker.start(flow);
  });
});