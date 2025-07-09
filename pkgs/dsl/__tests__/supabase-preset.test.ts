import { describe, it } from 'vitest';
import { Flow } from '../src/platforms/supabase.js';

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
        const _sql = ctx.sql;
        const _anonSupabase = ctx.anonSupabase;
        const _serviceSupabase = ctx.serviceSupabase;
        const _env = ctx.env;
        const _shutdownSignal = ctx.shutdownSignal;
        
        // This would demonstrate that autocomplete works
        // In an IDE, typing "ctx." would show all these properties
        return { processed: true };
      });

    // The flow should be correctly typed
    const _: typeof flow = flow;
  });

  it('should allow adding custom resources on top of platform resources', () => {
    interface CustomResources {
      logger: { log: (msg: string) => void };
      cache: { get: (key: string) => string | null };
    }

    const flow = new Flow<any, CustomResources>({ slug: 'custom_flow' })
      .step({ slug: 'process' }, async (input, ctx) => {
        // Should have all platform resources
        ctx.sql;
        ctx.anonSupabase;
        ctx.serviceSupabase;
        
        // Plus custom resources
        ctx.logger.log('test');
        ctx.cache.get('key');
        
        return { done: true };
      });

    const _: typeof flow = flow;
  });
});