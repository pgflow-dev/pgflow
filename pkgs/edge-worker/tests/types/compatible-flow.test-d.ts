import { Flow as SupabaseFlow } from '@pgflow/dsl/supabase';
import { EdgeWorker } from '../../src/EdgeWorker.js';
import type { Json } from '@pgflow/dsl';

// Example 1: Flow using only platform resources - should work
const validFlow = new SupabaseFlow({ slug: 'valid_flow' })
  .step({ slug: 'query' }, async (_input, ctx) => {
    // Platform resources (sql, supabase) are available automatically
    const result = await ctx.sql`SELECT * FROM users`;
    return { users: result };
  })
  .step({ slug: 'notify' }, (_input, ctx) => {
    // Supabase client is available
    void ctx.supabase;
    return { notified: true };
  });

// This compiles without errors - flow is compatible with platform
EdgeWorker.start(validFlow);

// Example 2: Flow requiring custom resources - should fail type check
interface RedisClient {
  get: (key: string) => Promise<string | null>;
}

const invalidFlow = new SupabaseFlow<Json, { redis: RedisClient }>({
  slug: 'invalid_flow'
})
  .step({ slug: 'cache' }, (_input, ctx) => {
    // redis is available in handler due to type parameter
    void ctx.redis;
    return { cached: true };
  });

// This should cause a TypeScript error - platform doesn't provide redis
// @ts-expect-error - Platform doesn't provide redis
EdgeWorker.start(invalidFlow);

// Example 3: Flow using only base context (no platform resources) - should work
const baseContextFlow = new SupabaseFlow({ slug: 'base_context_flow' })
  .step({ slug: 'check_env' }, (_input, ctx) => {
    // Only using base context properties (env, shutdownSignal)
    const apiKey = ctx.env.API_KEY;
    void ctx.shutdownSignal;
    return { hasApiKey: !!apiKey };
  });

// This compiles without errors - base context is always available
EdgeWorker.start(baseContextFlow);

// Example 4: Flow using mixed platform resources across steps - should work
const mixedResourcesFlow = new SupabaseFlow({ slug: 'mixed_resources_flow' })
  .step({ slug: 'query_db' }, async (_input, ctx) => {
    // Uses sql in this step
    const result = await ctx.sql`SELECT id FROM users LIMIT 1`;
    return { userId: result[0]?.id as string };
  })
  .step({ slug: 'call_api', dependsOn: ['query_db'] }, async (input, ctx) => {
    // Uses supabase client in this step
    const { data } = await ctx.supabase.from('profiles').select('*').eq('user_id', input.query_db.userId);
    return { profile: data };
  });

// This compiles without errors - both sql and supabase are platform resources
EdgeWorker.start(mixedResourcesFlow);