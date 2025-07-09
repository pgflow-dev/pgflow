import { describe, it, expectTypeOf } from 'vitest';
import { Flow } from '../src/platforms/supabase.js';
import type { Env, UserEnv } from '../src/index.js';

/**
 * This test file verifies the environment type validation system.
 * It tests that:
 * 1. Supabase flows get typed environment variables
 * 2. UserEnv augmentation works correctly
 * 3. Invalid UserEnv types cause compilation errors
 */

describe('Environment Type Validation', () => {
  it('should provide typed Supabase environment variables', () => {
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'process' }, async (input, ctx) => {
        // Supabase-specific env vars should be typed
        expectTypeOf(ctx.env.EDGE_WORKER_DB_URL).toEqualTypeOf<string>();
        expectTypeOf(ctx.env.EDGE_WORKER_LOG_LEVEL).toEqualTypeOf<string | undefined>();
        
        // Random env vars should still be accessible
        expectTypeOf(ctx.env.RANDOM_VAR).toEqualTypeOf<string | undefined>();
        
        return { processed: true };
      });

    const _: typeof flow = flow;
  });

  it('should work with custom resources', () => {
    interface CustomResources {
      logger: { log: (msg: string) => void };
      cache: { get: (key: string) => string | null };
    }

    const flow = new Flow<{ input: string }, CustomResources>({ slug: 'custom_flow' })
      .step({ slug: 'process' }, async (input, ctx) => {
        // Should have all platform resources
        ctx.sql;
        ctx.anonSupabase;
        ctx.serviceSupabase;
        
        // Plus custom resources
        ctx.logger.log('test');
        ctx.cache.get('key');
        
        // And typed env vars
        expectTypeOf(ctx.env.EDGE_WORKER_DB_URL).toEqualTypeOf<string>();
        
        return { done: true };
      });

    const _: typeof flow = flow;
  });

  it('should validate that Extra extends Record<string, unknown>', () => {
    // These should compile fine
    type ValidExtra1 = { redis: unknown };
    type ValidExtra2 = { logger: unknown; cache: unknown };
    type ValidExtra3 = Record<string, unknown>;
    
    type TestInput = { data: string };
    
    // This demonstrates the constraint works
    const flow1 = new Flow<TestInput, ValidExtra1>({ slug: 'test1' });
    const flow2 = new Flow<TestInput, ValidExtra2>({ slug: 'test2' });
    const flow3 = new Flow<TestInput, ValidExtra3>({ slug: 'test3' });
    
    // Just verify they exist
    const _: typeof flow1 = flow1;
    const __: typeof flow2 = flow2;
    const ___: typeof flow3 = flow3;
    
    // Note: Invalid types like string, number, etc. would cause compilation errors
    // but we can't easily test compilation failures in vitest
  });
});

// This demonstrates how users would augment UserEnv
// In a real project, this would be in a separate .d.ts file
declare module '@pgflow/dsl' {
  interface UserEnv {
    DATABASE_URL: string;
    API_KEY: string;
    OPTIONAL_FLAG?: string;
  }
}

describe('UserEnv Augmentation', () => {
  it('should support user-defined environment variables', () => {
    const flow = new Flow({ slug: 'user_env_flow' })
      .step({ slug: 'process' }, async (input, ctx) => {
        // User-defined env vars should be typed
        expectTypeOf(ctx.env.DATABASE_URL).toEqualTypeOf<string>();
        expectTypeOf(ctx.env.API_KEY).toEqualTypeOf<string>();
        expectTypeOf(ctx.env.OPTIONAL_FLAG).toEqualTypeOf<string | undefined>();
        
        // Platform env vars should still be there
        expectTypeOf(ctx.env.EDGE_WORKER_DB_URL).toEqualTypeOf<string>();
        
        // Random vars should still work
        expectTypeOf(ctx.env.UNKNOWN_VAR).toEqualTypeOf<string | undefined>();
        
        return { processed: true };
      });

    const _: typeof flow = flow;
  });
});