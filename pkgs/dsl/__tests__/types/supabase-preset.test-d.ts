import { describe, it, expectTypeOf } from 'vitest';
import {
  Flow as SupabaseFlow,
  SupabaseEnv,
  SupabaseResources,
  SupabasePlatformContext,
} from '../../src/platforms/supabase.js';
import { FlowContext, ExtractFlowContext } from '../../src/index.js';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock custom resource types for testing context mixing
interface CustomRedis {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
}

interface CustomAI {
  generate: (prompt: string) => Promise<string>;
  classify: (text: string) => Promise<{ category: string; confidence: number }>;
}

describe('Supabase Flow Type Tests', () => {
  it('should provide all Supabase platform resources by default', () => {
    const flow = new SupabaseFlow({ slug: 'supabase_default' }).step(
      { slug: 'query' },
      (flowInput, context) => {
        // Should have all Supabase platform resources
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

        // Should still have base context
        expectTypeOf(context.env).toMatchTypeOf<SupabaseEnv>();
        expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();

        return { result: 'success' };
      }
    );

    // Flow context should be FlowContext<SupabaseEnv> & SupabasePlatformContext
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<FlowContext<SupabaseEnv> & SupabasePlatformContext>();
  });

  it('should provide typed Supabase environment variables', () => {
    const flow = new SupabaseFlow({ slug: 'supabase_env' }).step(
      { slug: 'check_env' },
      (flowInput, context) => {
        // Required Supabase env vars should be typed as string (not undefined)
        expectTypeOf(context.env.SUPABASE_DB_URL).toEqualTypeOf<string>();
        expectTypeOf(context.env.SUPABASE_URL).toEqualTypeOf<string>();
        expectTypeOf(context.env.SUPABASE_ANON_KEY).toEqualTypeOf<string>();
        expectTypeOf(
          context.env.SUPABASE_SERVICE_ROLE_KEY
        ).toEqualTypeOf<string>();
        expectTypeOf(context.env.SB_EXECUTION_ID).toEqualTypeOf<string>();

        // Optional env vars should be string | undefined
        expectTypeOf(context.env.EDGE_WORKER_DB_URL).toEqualTypeOf<
          string | undefined
        >();
        expectTypeOf(context.env.EDGE_WORKER_LOG_LEVEL).toEqualTypeOf<
          string | undefined
        >();

        // Should still allow arbitrary env vars (base Env behavior)
        expectTypeOf(context.env.CUSTOM_VAR).toEqualTypeOf<
          string | undefined
        >();

        return { envChecked: true };
      }
    );

    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx['env']>().toMatchTypeOf<SupabaseEnv>();
  });

  it('should allow adding custom resources via Flow type parameter', () => {
    const flow = new SupabaseFlow<{ data: string }, { redis: CustomRedis; ai: CustomAI }>({
      slug: 'custom_resources'
    })
      .step({ slug: 'db_query' }, (flowInput, context) => {
        // Should have all Supabase platform resources
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

        // Should have custom resources from Flow type parameter
        expectTypeOf(context.redis).toEqualTypeOf<CustomRedis>();
        expectTypeOf(context.ai).toEqualTypeOf<CustomAI>();

        // Should have typed Supabase env
        expectTypeOf(context.env.SUPABASE_URL).toEqualTypeOf<string>();

        return { data: 'result' };
      })
      .step({ slug: 'ai_process' }, (flowInput, context) => {
        // All steps get same context (no accumulation)
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.redis).toEqualTypeOf<CustomRedis>();
        expectTypeOf(context.ai).toEqualTypeOf<CustomAI>();

        return { processed: true };
      });

    // Flow context should have Supabase platform + custom resources
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<
      FlowContext<SupabaseEnv> & SupabasePlatformContext & {
        redis: CustomRedis;
        ai: CustomAI;
      }
    >();
  });

  it('should support explicit context type parameter with Supabase Flow', () => {
    interface ExplicitCustomContext extends Record<string, unknown> {
      cache: CustomRedis;
      analytics: { track: (event: string) => void };
    }

    const flow = new SupabaseFlow<{ userId: string }, ExplicitCustomContext>({
      slug: 'explicit_supabase_flow',
    }).step({ slug: 'fetch_user' }, (flowInput, context) => {
      // Should have Supabase platform resources
      expectTypeOf(context.sql).toEqualTypeOf<Sql>();
      expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

      // Should have explicit custom context
      expectTypeOf(context.cache).toEqualTypeOf<CustomRedis>();
      expectTypeOf(context.analytics).toEqualTypeOf<{
        track: (event: string) => void;
      }>();

      // Should have typed Supabase env
      expectTypeOf(context.env).toMatchTypeOf<SupabaseEnv>();

      return { user: { id: flowInput.userId, name: 'Test' } };
    });

    // Flow context should combine Supabase platform + explicit custom context
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<
      FlowContext<SupabaseEnv> & SupabasePlatformContext & ExplicitCustomContext
    >();
  });

  it('should verify SupabaseResources type structure', () => {
    // Verify the SupabaseResources interface has correct structure
    expectTypeOf<SupabaseResources>().toMatchTypeOf<{
      sql: Sql;
      supabase: SupabaseClient;
    }>();
  });

  it('should verify SupabasePlatformContext structure', () => {
    // SupabasePlatformContext now only includes resources (sql, supabase)
    // The env property comes from FlowContext<SupabaseEnv>, not from platform context
    expectTypeOf<SupabasePlatformContext>().toMatchTypeOf<SupabaseResources>();
    expectTypeOf<SupabasePlatformContext>().toEqualTypeOf<SupabaseResources>();
  });

  it('should preserve step input inference with Supabase Flow', () => {
    const flow = new SupabaseFlow<{ initial: number }, { factor: number }>({
      slug: 'step_inference',
    })
      .step({ slug: 'multiply' }, (flowInput, context) => {
        // Step input should be properly inferred - root step gets flow input directly
        expectTypeOf(flowInput.initial).toEqualTypeOf<number>();

        // Should have Supabase resources + custom context
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.factor).toEqualTypeOf<number>();

        return { result: flowInput.initial * context.factor };
      })
      .step({ slug: 'format', dependsOn: ['multiply'] }, (deps, context) => {
        // Should have proper step input inference from dependencies (deps only, no run key)
        expectTypeOf(deps.multiply.result).toEqualTypeOf<number>();
        // Access flow input via context.flowInput (Promise type)
        expectTypeOf(context.flowInput).toEqualTypeOf<Promise<{ initial: number }>>();

        // Should still have all context
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();
        expectTypeOf(context.factor).toEqualTypeOf<number>();

        return { formatted: `Result: ${deps.multiply.result}` };
      });

    // Verify flow context
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<
      FlowContext<SupabaseEnv> & SupabasePlatformContext & {
        factor: number;
      }
    >();
  });

  it('should provide same context to all handlers in a flow', () => {
    const flow = new SupabaseFlow<{ data: string }, { logger: { info: (msg: string) => void } }>({
      slug: 'shared_context',
    })
      .step({ slug: 'step1' }, (flowInput, context) => {
        // All handlers get same context
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();
        expectTypeOf(context.logger).toEqualTypeOf<{ info: (msg: string) => void }>();

        return { step1Done: true };
      })
      .step({ slug: 'step2' }, (flowInput, context) => {
        // Same context in all steps
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();
        expectTypeOf(context.logger).toEqualTypeOf<{ info: (msg: string) => void }>();

        return { step2Done: true };
      })
      .step({ slug: 'step3' }, (flowInput, context) => {
        // Same context in all steps
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();
        expectTypeOf(context.logger).toEqualTypeOf<{ info: (msg: string) => void }>();

        return { allDone: true };
      });

    // Final flow context includes all declared resources
    type FlowCtx = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowCtx>().toEqualTypeOf<
      FlowContext<SupabaseEnv> & SupabasePlatformContext & {
        logger: { info: (msg: string) => void };
      }
    >();
  });
});
