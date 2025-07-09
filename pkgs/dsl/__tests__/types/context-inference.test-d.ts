import { Flow, Context, ExtractFlowContext } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

// Mock types for testing
interface TestSql {
  query: (sql: string) => Promise<any>;
}

interface TestRedis {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
}

interface TestSupabase {
  from: (table: string) => any;
}

describe('Context Type Inference Tests', () => {
  it('should have minimal context by default', () => {
    const flow = new Flow({ slug: 'minimal_flow' })
      .step({ slug: 'process' }, (input, context) => {
        expectTypeOf(context).toMatchTypeOf<Context>();
        expectTypeOf(context.env).toEqualTypeOf<Record<string, string | undefined>>();
        expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();
        
        // Should not have sql by default
        expectTypeOf(context).not.toHaveProperty('sql');
        
        return { processed: true };
      });

    // ExtractFlowContext should return base Context for minimal flow
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<Context>();
  });

  it('should infer context from single handler type annotation', () => {
    const flow = new Flow({ slug: 'single_inferred' })
      .step({ slug: 'query' }, (input, context: { sql: TestSql }) => {
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        // Base Context properties are STILL available even without typing
        expectTypeOf(context.env).toEqualTypeOf<Record<string, string | undefined>>();
        expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();
        
        return { result: 'data' };
      });

    // ExtractFlowContext should return Context & { sql: TestSql }
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<Context & { sql: TestSql }>();
  });

  it('should accumulate context from multiple handlers', () => {
    const flow = new Flow({ slug: 'multi_inferred' })
      .step({ slug: 'query' }, (input, context: Context & { sql: TestSql }) => {
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        return { users: [] };
      })
      .step({ slug: 'cache' }, (input, context: Context & { redis: TestRedis }) => {
        expectTypeOf(context.redis).toEqualTypeOf<TestRedis>();
        return { cached: true };
      })
      .step({ slug: 'notify' }, (input, context: Context & { sql: TestSql, supabase: TestSupabase }) => {
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        expectTypeOf(context.supabase).toEqualTypeOf<TestSupabase>();
        return { notified: true };
      });

    // ExtractFlowContext should have base Context plus all accumulated resources
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<Context & {
      sql: TestSql;
      redis: TestRedis;
      supabase: TestSupabase;
    }>();
  });

  it('should support explicit context type parameter', () => {
    interface ExplicitContext {
      sql: TestSql;
      cache: TestRedis;
      pubsub: { publish: (event: string) => void };
    }

    const flow = new Flow<{ userId: string }, ExplicitContext>({ slug: 'explicit_flow' })
      .step({ slug: 'get_user' }, (input, context) => {
        // All properties from ExplicitContext should be available
        expectTypeOf(context).toMatchTypeOf<Context & ExplicitContext>();
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        expectTypeOf(context.cache).toEqualTypeOf<TestRedis>();
        expectTypeOf(context.pubsub).toEqualTypeOf<{ publish: (event: string) => void }>();
        
        return { id: 1, name: 'Test' };
      });

    // ExtractFlowContext should return base Context merged with explicit type
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<Context & ExplicitContext>();
  });

  it('should support mixed explicit and inferred context', () => {
    const flow = new Flow<{ id: string }, { sql: TestSql }>({ slug: 'mixed_flow' })
      .step({ slug: 'query' }, (input, context) => {
        // Has sql from explicit type
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        return { data: 'result' };
      })
      .step({ slug: 'enhance' }, (input, context: Context & { sql: TestSql, ai: { generate: () => string } }) => {
        // Should have both sql (from explicit) and ai (from inference)
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        expectTypeOf(context.ai).toEqualTypeOf<{ generate: () => string }>();
        return { enhanced: true };
      });

    // ExtractFlowContext should have base Context plus both explicit and inferred
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<Context & {
      sql: TestSql;
      ai: { generate: () => string };
    }>();
  });

  it('should allow handlers to specify only custom context but still get base Context', () => {
    const flow = new Flow({ slug: 'custom_only' })
      .step({ slug: 'process' }, (input, context: { customField: string }) => {
        expectTypeOf(context.customField).toEqualTypeOf<string>();
        // Base Context properties are ALWAYS available now
        expectTypeOf(context.env).toEqualTypeOf<Record<string, string | undefined>>();
        expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();
        
        return { processed: context.customField };
      });

    // ExtractFlowContext should have base Context plus the custom field
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<Context & { customField: string }>();
  });

  it('should preserve existing step type inference while adding context', () => {
    const flow = new Flow<{ initial: number }>({ slug: 'step_chain' })
      .step({ slug: 'double' }, (input, context: Context & { multiplier: number }) => {
        expectTypeOf(input.run.initial).toEqualTypeOf<number>();
        expectTypeOf(context.multiplier).toEqualTypeOf<number>();
        return { doubled: input.run.initial * 2 };
      })
      .step({ slug: 'format', dependsOn: ['double'] }, (input, context: Context & { formatter: (n: number) => string }) => {
        expectTypeOf(input.run.initial).toEqualTypeOf<number>();
        expectTypeOf(input.double.doubled).toEqualTypeOf<number>();
        expectTypeOf(context.formatter).toEqualTypeOf<(n: number) => string>();
        return { formatted: context.formatter(input.double.doubled) };
      });

    // Context should have base plus accumulated requirements
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<Context & {
      multiplier: number;
      formatter: (n: number) => string;
    }>();
  });
});