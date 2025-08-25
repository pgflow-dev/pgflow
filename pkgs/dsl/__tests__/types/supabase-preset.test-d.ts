import { describe, it, expectTypeOf } from 'vitest';
import {
  Flow as SupabaseFlow,
  SupabaseEnv,
  SupabaseResources,
  SupabasePlatformContext,
} from '../../src/platforms/supabase.js';
import { BaseContext, Context, ExtractFlowContext } from '../../src/index.js';
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
      (input, context) => {
        // Should have all Supabase platform resources
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

        // Should still have base context
        expectTypeOf(context.env).toMatchTypeOf<SupabaseEnv>();
        expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();

        return { result: 'success' };
      }
    );

    // Flow context should be SupabasePlatformContext
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<SupabasePlatformContext>();
  });

  it('should provide typed Supabase environment variables', () => {
    const flow = new SupabaseFlow({ slug: 'supabase_env' }).step(
      { slug: 'check_env' },
      (input, context) => {
        // Required Supabase env vars should be typed as string (not undefined)
        expectTypeOf(context.env.EDGE_WORKER_DB_URL).toEqualTypeOf<string>();
        expectTypeOf(context.env.SUPABASE_URL).toEqualTypeOf<string>();
        expectTypeOf(context.env.SUPABASE_ANON_KEY).toEqualTypeOf<string>();
        expectTypeOf(
          context.env.SUPABASE_SERVICE_ROLE_KEY
        ).toEqualTypeOf<string>();
        expectTypeOf(context.env.SB_EXECUTION_ID).toEqualTypeOf<string>();

        // Optional env var should be string | undefined
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

    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext['env']>().toEqualTypeOf<SupabaseEnv>();
  });

  it('should allow adding custom resources alongside Supabase platform resources', () => {
    const flow = new SupabaseFlow({ slug: 'custom_resources' })
      .step(
        { slug: 'db_query' },
        (input, context: Context<{ redis: CustomRedis }>) => {
          // Should have all Supabase platform resources
          expectTypeOf(context.sql).toEqualTypeOf<Sql>();
          expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

          // Should have custom resource from handler annotation
          expectTypeOf(context.redis).toEqualTypeOf<CustomRedis>();

          // Should have typed Supabase env
          expectTypeOf(context.env.SUPABASE_URL).toEqualTypeOf<string>();

          return { data: 'result' };
        }
      )
      .step(
        { slug: 'ai_process' },
        (input, context: Context<{ ai: CustomAI }>) => {
          // Should accumulate all resources from previous steps
          expectTypeOf(context.sql).toEqualTypeOf<Sql>();
          expectTypeOf(context.redis).toEqualTypeOf<CustomRedis>();
          expectTypeOf(context.ai).toEqualTypeOf<CustomAI>();

          return { processed: true };
        }
      );

    // Flow context should have Supabase platform + accumulated custom resources
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<
      SupabasePlatformContext & {
        redis: CustomRedis;
        ai: CustomAI;
      }
    >();
  });

  it('should support explicit context type parameter with Supabase Flow', () => {
    interface ExplicitCustomContext {
      cache: CustomRedis;
      analytics: { track: (event: string) => void };
    }

    const flow = new SupabaseFlow<{ userId: string }, ExplicitCustomContext>({
      slug: 'explicit_supabase_flow',
    }).step({ slug: 'fetch_user' }, (input, context) => {
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

      return { user: { id: input.run.userId, name: 'Test' } };
    });

    // Flow context should combine Supabase platform + explicit custom context
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<
      SupabasePlatformContext & ExplicitCustomContext
    >();
  });

  it('should support mixed explicit and inferred context on Supabase Flow', () => {
    interface InitialContext {
      logger: { info: (msg: string) => void };
    }

    const flow = new SupabaseFlow<{ data: string }, InitialContext>({
      slug: 'mixed_supabase_flow',
    })
      .step({ slug: 'process' }, (input, context) => {
        // Has Supabase platform resources
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

        // Has explicit context
        expectTypeOf(context.logger).toEqualTypeOf<{
          info: (msg: string) => void;
        }>();

        return { processed: input.run.data };
      })
      .step(
        { slug: 'enhance' },
        (input, context: Context<{ ai: CustomAI }>) => {
          // Should have Supabase platform resources
          expectTypeOf(context.sql).toEqualTypeOf<Sql>();
          expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

          // Should have both explicit and inferred context
          expectTypeOf(context.logger).toEqualTypeOf<{
            info: (msg: string) => void;
          }>();
          expectTypeOf(context.ai).toEqualTypeOf<CustomAI>();

          return { enhanced: true };
        }
      );

    // Flow context should have Supabase platform + explicit + inferred
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<
      SupabasePlatformContext & {
        logger: { info: (msg: string) => void };
        ai: CustomAI;
      }
    >();
  });

  it('should verify SupabaseResources type structure', () => {
    // Verify the SupabaseResources interface has correct structure
    expectTypeOf<SupabaseResources>().toEqualTypeOf<{
      sql: Sql;
      supabase: SupabaseClient;
    }>();
  });

  it('should verify SupabasePlatformContext structure', () => {
    // Verify that SupabasePlatformContext combines BaseContext + SupabaseResources + typed env
    expectTypeOf<SupabasePlatformContext>().toMatchTypeOf<BaseContext>();
    expectTypeOf<SupabasePlatformContext>().toMatchTypeOf<SupabaseResources>();
    expectTypeOf<SupabasePlatformContext['env']>().toEqualTypeOf<SupabaseEnv>();
  });

  it('should preserve step input inference with Supabase Flow', () => {
    const flow = new SupabaseFlow<{ initial: number }>({
      slug: 'step_inference',
    })
      .step(
        { slug: 'multiply' },
        (input, context: Context<{ factor: number }>) => {
          // Step input should be properly inferred
          expectTypeOf(input.run.initial).toEqualTypeOf<number>();

          // Should have Supabase resources + custom context
          expectTypeOf(context.sql).toEqualTypeOf<Sql>();
          expectTypeOf(context.factor).toEqualTypeOf<number>();

          return { result: input.run.initial * context.factor };
        }
      )
      .step({ slug: 'format', dependsOn: ['multiply'] }, (input, context) => {
        // Should have proper step input inference from dependencies
        expectTypeOf(input.run.initial).toEqualTypeOf<number>();
        expectTypeOf(input.multiply.result).toEqualTypeOf<number>();

        // Should still have all accumulated context
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();
        expectTypeOf(context.factor).toEqualTypeOf<number>();

        return { formatted: `Result: ${input.multiply.result}` };
      });

    // Verify flow context accumulation
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<
      SupabasePlatformContext & {
        factor: number;
      }
    >();
  });

  it('should allow handler-specific context without affecting other handlers', () => {
    const flow = new SupabaseFlow({ slug: 'isolated_context' })
      .step(
        { slug: 'step1' },
        (input, context: Context<{ step1Resource: string }>) => {
          expectTypeOf(context.sql).toEqualTypeOf<Sql>();
          expectTypeOf(context.step1Resource).toEqualTypeOf<string>();

          // Should not have step2Resource
          expectTypeOf(context).not.toHaveProperty('step2Resource');

          return { step1Done: true };
        }
      )
      .step(
        { slug: 'step2' },
        (input, context: Context<{ step2Resource: number }>) => {
          expectTypeOf(context.sql).toEqualTypeOf<Sql>();
          expectTypeOf(context.step2Resource).toEqualTypeOf<number>();

          // Should have accumulated step1Resource from previous step
          expectTypeOf(context.step1Resource).toEqualTypeOf<string>();

          return { step2Done: true };
        }
      )
      .step({ slug: 'step3' }, (input, context) => {
        // Should have Supabase platform resources without explicit typing
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

        // Should have accumulated context from previous steps
        expectTypeOf(context.step1Resource).toEqualTypeOf<string>();
        expectTypeOf(context.step2Resource).toEqualTypeOf<number>();

        return { allDone: true };
      });

    // Final flow context should accumulate all step-specific resources
    type FlowContext = ExtractFlowContext<typeof flow>;
    expectTypeOf<FlowContext>().toEqualTypeOf<
      SupabasePlatformContext & {
        step1Resource: string;
        step2Resource: number;
      }
    >();
  });
});
