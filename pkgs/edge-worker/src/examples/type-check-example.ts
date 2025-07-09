import { Flow } from '@pgflow/dsl';
import { EdgeWorker } from '../EdgeWorker.js';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';

// Example 1: Flow using only platform resources - should work
const validFlow = new Flow({ slug: 'valid_flow' })
  .step({ slug: 'query' }, async (input, ctx: { sql: Sql }) => {
    const result = await ctx.sql`SELECT * FROM users`;
    return { users: result };
  })
  .step({ slug: 'notify' }, async (input, ctx: { serviceSupabase: SupabaseClient }) => {
    // Use service role client for admin operations
    return { notified: true };
  });

// This should compile without errors
EdgeWorker.start(validFlow);

// Example 2: Flow using non-existent resources - should fail
const invalidFlow = new Flow({ slug: 'invalid_flow' })
  .step({ slug: 'cache' }, async (input, ctx: { redis: any }) => {
    // Platform doesn't provide redis
    return { cached: true };
  });

// This should cause a TypeScript error
// @ts-expect-error - Platform doesn't provide redis
EdgeWorker.start(invalidFlow);