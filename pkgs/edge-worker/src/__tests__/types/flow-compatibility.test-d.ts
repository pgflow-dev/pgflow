import { describe, it } from 'vitest';
import { Flow, type Context } from '@pgflow/dsl';
import { EdgeWorker } from '../../EdgeWorker.js';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock types for testing
interface TestRedis {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
}

describe('Flow Compatibility Type Tests', () => {
  it('should accept flows that only use platform resources', () => {
    const flow = new Flow({ slug: 'platform_only' })
      .step({ slug: 'query' }, (_input, _ctx: Context<{ sql: Sql }>) => {
        return { result: 'data' };
      })
      .step({ slug: 'auth' }, (_input, _ctx: Context<{ anonSupabase: SupabaseClient }>) => {
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
      .step({ slug: 'cache' }, (_input, _ctx: Context<{ redis: TestRedis }>) => {
        return { cached: true };
      });

    // @ts-expect-error - Flow requires redis which platform doesn't provide
    EdgeWorker.start(flow);
  });

  it('should work with mixed platform resources', () => {
    const flow = new Flow({ slug: 'mixed_platform' })
      .step({ slug: 'query' }, (_input, _ctx: Context<{ sql: Sql }>) => {
        return { data: [] };
      })
      .step({ slug: 'store' }, (_input, _ctx: Context<{ 
        sql: Sql,
        serviceSupabase: SupabaseClient 
      }>) => {
        return { stored: true };
      });

    // This should compile without errors
    EdgeWorker.start(flow);
  });
});