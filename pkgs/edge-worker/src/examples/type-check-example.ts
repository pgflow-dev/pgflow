import { Flow as SupabaseFlow } from '@pgflow/dsl/supabase';
import { EdgeWorker } from '../EdgeWorker.js';
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