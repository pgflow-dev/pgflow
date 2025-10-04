import { Flow, FlowContext, ExtractFlowContext } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';
import type { Json } from '../../src/index.js';

// Mock types for testing
interface TestSql {
  query: (sql: string) => Promise<any>;
}

interface TestRedis {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
}

describe('Context Type Inference Tests', () => {
  it('should have FlowContext by default (no custom resources)', () => {
    const flow = new Flow({ slug: 'minimal_flow' })
      .step({ slug: 'process' }, (input, context) => {
        // Handler automatically gets FlowContext (no annotation needed!)
        expectTypeOf(context).toMatchTypeOf<FlowContext>();
        expectTypeOf(context.env).toEqualTypeOf<Record<string, string | undefined>>();
        expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();
        expectTypeOf(context.stepTask.run_id).toEqualTypeOf<string>();
        expectTypeOf(context.rawMessage.msg_id).toEqualTypeOf<number>();

        return { processed: true };
      });

    // ExtractFlowContext returns just FlowContext (no custom resources)
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<FlowContext>();
  });

  it('should provide custom context via Flow type parameter', () => {
    const flow = new Flow<Json, { sql: TestSql }>({ slug: 'custom_context' })
      .step({ slug: 'query' }, (input, context) => {
        // No handler annotation needed! Type parameter provides context
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        expectTypeOf(context.env).toEqualTypeOf<Record<string, string | undefined>>();
        expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();

        return { result: 'data' };
      });

    // ExtractFlowContext returns FlowContext & custom resources
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<FlowContext & { sql: TestSql }>();
  });

  it('should share custom context across all steps', () => {
    const flow = new Flow<Json, { sql: TestSql; redis: TestRedis }>({ slug: 'shared_context' })
      .step({ slug: 'query' }, (input, context) => {
        // All steps get the same context automatically
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        expectTypeOf(context.redis).toEqualTypeOf<TestRedis>();
        return { users: [] };
      })
      .step({ slug: 'cache' }, (input, context) => {
        // Second step also has access to all resources
        expectTypeOf(context.sql).toEqualTypeOf<TestSql>();
        expectTypeOf(context.redis).toEqualTypeOf<TestRedis>();
        return { cached: true };
      });

    // ExtractFlowContext returns FlowContext & all custom resources
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<FlowContext & {
      sql: TestSql;
      redis: TestRedis;
    }>();
  });

  it('should preserve existing step type inference while adding context', () => {
    const flow = new Flow<{ initial: number }, { multiplier: number }>({ slug: 'step_chain' })
      .step({ slug: 'double' }, (input, context) => {
        // Input inference still works
        expectTypeOf(input.run.initial).toEqualTypeOf<number>();
        // Custom context available
        expectTypeOf(context.multiplier).toEqualTypeOf<number>();
        return { doubled: input.run.initial * 2 };
      })
      .step({ slug: 'format', dependsOn: ['double'] }, (input, context) => {
        // Dependent step has access to previous step output
        expectTypeOf(input.run.initial).toEqualTypeOf<number>();
        expectTypeOf(input.double.doubled).toEqualTypeOf<number>();
        // And still has custom context
        expectTypeOf(context.multiplier).toEqualTypeOf<number>();
        return { formatted: String(input.double.doubled) };
      });

    // Context includes custom resources
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<FlowContext & { multiplier: number }>();
  });
});
