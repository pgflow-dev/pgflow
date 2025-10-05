import { Flow } from '../../src/platforms/supabase.js';
import { describe, it, expectTypeOf } from 'vitest';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Supabase Flow Context Inference', () => {
  it('should infer platform context without annotations', () => {
    const flow = new Flow({ slug: 'test' })
      .step({ slug: 'query' }, (input, context) => {  // NO annotation!
        // Platform resources
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();

        // FlowContext properties
        expectTypeOf(context.stepTask.run_id).toEqualTypeOf<string>();
        expectTypeOf(context.rawMessage.msg_id).toEqualTypeOf<number>();
        expectTypeOf(context.workerConfig.maxConcurrent).toEqualTypeOf<number>();
        expectTypeOf(context.env).toMatchTypeOf<Record<string, string | undefined>>();
        expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();

        return { result: 'data' };
      });

    void flow; // Ensure flow builds correctly
  });

  it('should work across multiple steps', () => {
    const flow = new Flow({ slug: 'multi' })
      .step({ slug: 's1' }, (input, context) => {
        expectTypeOf(context.sql).toEqualTypeOf<Sql>();
        return { data: 'test' };
      })
      .step({ slug: 's2', dependsOn: ['s1'] }, (input, context) => {
        expectTypeOf(context.supabase).toEqualTypeOf<SupabaseClient>();
        expectTypeOf(input.s1.data).toEqualTypeOf<string>();
        return { final: true };
      });

    void flow; // Ensure flow builds correctly
  });
});
