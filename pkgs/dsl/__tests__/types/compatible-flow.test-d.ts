import { describe, expectTypeOf, it } from 'vitest';
import {
  Flow,
  type AnyFlow,
  type CompatibleFlow,
  type Json,
} from '../../src/index.js';
import {
  Flow as SupabaseFlow,
  type SupabaseResources,
} from '../../src/platforms/supabase.js';

interface RedisClient {
  get: (key: string) => Promise<string | null>;
}

type AcceptsCompatible<
  F extends AnyFlow,
  PR extends Record<string, unknown>,
  UR extends Record<string, unknown> = Record<string, never>
> = (flow: CompatibleFlow<F, PR, UR>) => void;

const acceptCompatible = <
  F extends AnyFlow,
  PR extends Record<string, unknown>,
  UR extends Record<string, unknown> = Record<string, never>
>(
  flow: CompatibleFlow<F, PR, UR>
) => {
  void flow;
};

describe('CompatibleFlow utility type', () => {
  it('accepts flows that only need base FlowContext', () => {
    const baseFlow = new Flow<Json>({ slug: 'base-compatible' }).step(
      { slug: 's1' },
      (_input, ctx) => ({ hasSignal: !!ctx.shutdownSignal })
    );

    acceptCompatible<typeof baseFlow, Record<string, never>>(baseFlow);

    type Result = CompatibleFlow<typeof baseFlow, Record<string, never>>;
    expectTypeOf<Result>().toEqualTypeOf<typeof baseFlow>();
  });

  it('accepts flows requiring platform resources when provided', () => {
    const platformFlow = new SupabaseFlow({ slug: 'platform-compatible' }).step(
      { slug: 'db' },
      async (_input, ctx) => {
        const rows = await ctx.sql`SELECT 1`;
        void ctx.supabase;
        return { rows: rows.length };
      }
    );

    acceptCompatible<typeof platformFlow, SupabaseResources>(platformFlow);

    type Result = CompatibleFlow<typeof platformFlow, SupabaseResources>;
    expectTypeOf<Result>().toEqualTypeOf<typeof platformFlow>();
  });

  it('rejects flows requiring platform resources when missing', () => {
    const platformFlow = new SupabaseFlow({ slug: 'platform-missing' }).step(
      { slug: 'db' },
      async (_input, ctx) => {
        const rows = await ctx.sql`SELECT 1`;
        return { rows: rows.length };
      }
    );

    const accept: AcceptsCompatible<
      typeof platformFlow,
      Record<string, never>
    > = acceptCompatible;
    // @ts-expect-error - platform resources are required by flow context
    accept(platformFlow);

    type Result = CompatibleFlow<typeof platformFlow, Record<string, never>>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  it('accepts user resources when explicitly provided', () => {
    const customCtxFlow = new Flow<Json, { redis: RedisClient }>({
      slug: 'user-resource-ok',
    }).step({ slug: 'cache' }, async (_input, ctx) => {
      const value = await ctx.redis.get('k1');
      return { value };
    });

    acceptCompatible<
      typeof customCtxFlow,
      Record<string, never>,
      { redis: RedisClient }
    >(customCtxFlow);

    type Result = CompatibleFlow<
      typeof customCtxFlow,
      Record<string, never>,
      { redis: RedisClient }
    >;
    expectTypeOf<Result>().toEqualTypeOf<typeof customCtxFlow>();
  });

  it('rejects user-resource flows when user resources are omitted', () => {
    const customCtxFlow = new Flow<Json, { redis: RedisClient }>({
      slug: 'user-resource-missing',
    }).step({ slug: 'cache' }, async (_input, ctx) => {
      const value = await ctx.redis.get('k1');
      return { value };
    });

    const accept: AcceptsCompatible<
      typeof customCtxFlow,
      Record<string, never>
    > = acceptCompatible;
    // @ts-expect-error - missing required user resources
    accept(customCtxFlow);

    type Result = CompatibleFlow<typeof customCtxFlow, Record<string, never>>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  it('accepts mixed platform and user resources', () => {
    const mixedFlow = new SupabaseFlow<Json, { redis: RedisClient }>({
      slug: 'mixed-compatible',
    }).step({ slug: 'mixed' }, async (_input, ctx) => {
      const rows = await ctx.sql`SELECT 1`;
      const value = await ctx.redis.get('k1');
      void ctx.supabase;
      return { rows: rows.length, value };
    });

    acceptCompatible<
      typeof mixedFlow,
      SupabaseResources,
      { redis: RedisClient }
    >(mixedFlow);

    type Result = CompatibleFlow<
      typeof mixedFlow,
      SupabaseResources,
      { redis: RedisClient }
    >;
    expectTypeOf<Result>().toEqualTypeOf<typeof mixedFlow>();
  });

  it('is invariant to optional output keys in step outputs', () => {
    const optionalOutputFlow = new SupabaseFlow({
      slug: 'optional-output-flow',
    })
      .step({ slug: 'producer' }, (): { entryId?: string } =>
        Math.random() > 0.5 ? { entryId: 'entry-1' } : {}
      )
      .step({ slug: 'consumer', dependsOn: ['producer'] }, (deps) => ({
        hasEntry: 'entryId' in deps.producer,
      }));

    acceptCompatible<typeof optionalOutputFlow, SupabaseResources>(
      optionalOutputFlow
    );

    type Result = CompatibleFlow<typeof optionalOutputFlow, SupabaseResources>;
    expectTypeOf<Result>().toEqualTypeOf<typeof optionalOutputFlow>();
  });
});
