import { describe, it, expectTypeOf } from 'vitest';
import { Flow } from '@pgflow/dsl/supabase';
import type { SupabaseResources } from '@pgflow/dsl/supabase';
import type { Json } from '@pgflow/dsl';
import type { Sql } from 'postgres';

// Extract SupabaseClient type from the same source dsl uses to guarantee type identity
// This prevents version mismatch issues when @supabase/supabase-js resolves to different versions
type SupabaseClientType = SupabaseResources['supabase'];

describe('Flow Compatibility Type Tests', () => {
  it('should create flows with proper step types', () => {
    new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1' }, (_input) => {
        return { result: 'ok' };
      });
  });

  it('should provide correct context type in handlers', () => {
    new Flow<{ value: number }>({ slug: 'test_flow' })
      .step({ slug: 'step1' }, (input, context) => {
        // Context should have base FlowContext properties
        expectTypeOf(context.env).toMatchTypeOf<Record<string, string | undefined>>();
        expectTypeOf(context.shutdownSignal).toMatchTypeOf<AbortSignal>();
        expectTypeOf(context.stepTask).toMatchTypeOf<{ run_id: string; step_slug: string }>();
        expectTypeOf(context.rawMessage).toMatchTypeOf<{ msg_id: number }>();

        // Context should have Supabase platform resources
        expectTypeOf(context.sql).toMatchTypeOf<Sql>();
        expectTypeOf(context.supabase).toMatchTypeOf<SupabaseClientType>();

        // Input should have run property
        expectTypeOf(input.run).toMatchTypeOf<{ value: number }>();

        return { processed: true };
      });
  });

  it('should handle dependent steps correctly', () => {
    new Flow<{ id: string }>({ slug: 'test_flow' })
      .step({ slug: 'fetch' }, (input) => {
        expectTypeOf(input.run).toMatchTypeOf<{ id: string }>();
        return { data: 'fetched' };
      })
      .step({ slug: 'process', dependsOn: ['fetch'] }, (input, context) => {
        // Input should have both run and fetch step output
        expectTypeOf(input.run).toMatchTypeOf<{ id: string }>();
        expectTypeOf(input.fetch).toMatchTypeOf<{ data: string }>();

        // Context should have Supabase resources
        expectTypeOf(context.sql).toMatchTypeOf<Sql>();
        expectTypeOf(context.supabase).toMatchTypeOf<SupabaseClientType>();

        return { processed: true };
      });
  });

  it('should handle custom context correctly', () => {
    interface CustomContext extends Record<string, unknown> {
      redis: { get: (key: string) => Promise<string> };
    }

    new Flow<Json, CustomContext>({ slug: 'test_flow' })
      .step({ slug: 'step1' }, (_input, context) => {
        // Should have base context
        expectTypeOf(context.env).toMatchTypeOf<Record<string, string | undefined>>();
        expectTypeOf(context.shutdownSignal).toMatchTypeOf<AbortSignal>();

        // Should have Supabase resources
        expectTypeOf(context.sql).toMatchTypeOf<Sql>();
        expectTypeOf(context.supabase).toMatchTypeOf<SupabaseClientType>();

        // Should have custom context
        expectTypeOf(context.redis).toMatchTypeOf<{ get: (key: string) => Promise<string> }>();

        return { result: 'ok' };
      });
  });

  it('should infer correct step output types', () => {
    const testFlow = new Flow<{ value: number }>({ slug: 'test_flow' })
      .step({ slug: 'double' }, (input) => {
        return { doubled: input.run.value * 2 };
      })
      .step({ slug: 'stringify', dependsOn: ['double'] }, (input) => {
        return { text: String(input.double.doubled) };
      });

    // Verify step definition types
    const doubleStep = testFlow.getStepDefinition('double');
    type DoubleOutput = ReturnType<typeof doubleStep.handler>;
    expectTypeOf<DoubleOutput>().toMatchTypeOf<{ doubled: number } | Promise<{ doubled: number }>>();

    const stringifyStep = testFlow.getStepDefinition('stringify');
    type StringifyInput = Parameters<typeof stringifyStep.handler>[0];
    expectTypeOf<StringifyInput>().toMatchTypeOf<{
      run: { value: number };
      double: { doubled: number };
    }>();
  });

  it('should handle async handlers', () => {
    new Flow<{ id: string }>({ slug: 'test_flow' })
      .step({ slug: 'fetch' }, async (input, context) => {
        // Can use async operations
        await context.sql`SELECT 1`;
        expectTypeOf(input.run).toMatchTypeOf<{ id: string }>();
        return { data: 'fetched' };
      })
      .step({ slug: 'process', dependsOn: ['fetch'] }, (input) => {
        // Input correctly typed with dependency
        expectTypeOf(input.fetch).toMatchTypeOf<{ data: string }>();
        return { processed: true };
      });
  });

  it('should handle complex dependency chains', () => {
    new Flow<{ url: string }>({ slug: 'test_flow' })
      .step({ slug: 'fetch' }, (_input) => {
        return { content: 'html' };
      })
      .step({ slug: 'parse', dependsOn: ['fetch'] }, (_input) => {
        return { title: 'Title', body: 'Body' };
      })
      .step({ slug: 'analyze', dependsOn: ['parse'] }, (_input) => {
        return { sentiment: 0.8 };
      })
      .step({ slug: 'save', dependsOn: ['parse', 'analyze'] }, (input, context) => {
        // Should have access to parse and analyze outputs
        expectTypeOf(input.run).toMatchTypeOf<{ url: string }>();
        expectTypeOf(input.parse).toMatchTypeOf<{ title: string; body: string }>();
        expectTypeOf(input.analyze).toMatchTypeOf<{ sentiment: number }>();

        // Should have Supabase resources
        expectTypeOf(context.sql).toMatchTypeOf<Sql>();
        expectTypeOf(context.supabase).toMatchTypeOf<SupabaseClientType>();

        return { saved: true };
      });
  });

  it('should handle JSON-serializable inputs and outputs', () => {
    const testFlow = new Flow<{ data: Json }>({ slug: 'test_flow' })
      .step({ slug: 'process' }, (input): { result: Json } => {
        // Input and output must be JSON-serializable
        expectTypeOf(input.run.data).toMatchTypeOf<Json>();
        return { result: { processed: true } };
      });

    // Verify the step output is JSON
    const stepDef = testFlow.getStepDefinition('process');
    type Output = ReturnType<typeof stepDef.handler>;
    expectTypeOf<Output>().toMatchTypeOf<{ result: Json } | Promise<{ result: Json }>>();
  });
});
