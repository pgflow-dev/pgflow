import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import { 
  Flow as CoreFlow, 
  type AnyInput, 
  type AnySteps, 
  type AnyDeps, 
  EmptySteps, 
  EmptyDeps 
} from '../index.js';
import type { Context } from './index.js';

/**
 * Supabase-specific platform resources
 */
export interface SupabaseResources {
  /**
   * PostgreSQL client for database operations
   */
  sql: Sql;

  /**
   * Anonymous Supabase client (always available on Supabase)
   */
  anonSupabase: SupabaseClient;

  /**
   * Service role Supabase client (always available on Supabase)
   */
  serviceSupabase: SupabaseClient;
}

/**
 * Complete context type for Supabase platform
 */
export type SupabaseContext = Context<SupabaseResources>;

/**
 * Pre-wired Flow class with Supabase context.
 * Handlers automatically have access to sql, anonSupabase, serviceSupabase,
 * env, and shutdownSignal without explicit typing.
 * 
 * @example
 * ```typescript
 * import { Flow } from '@pgflow/dsl/supabase';
 * 
 * const flow = new Flow({ slug: 'my_flow' })
 *   .step({ slug: 'query' }, async (input, ctx) => {
 *     // Full autocomplete for all Supabase resources!
 *     const result = await ctx.sql`SELECT * FROM users`;
 *     return { users: result };
 *   });
 * ```
 */
export class Flow<
  I extends AnyInput = AnyInput,
  Extra extends object = {},
  S extends AnySteps = EmptySteps,
  D extends AnyDeps = EmptyDeps,
> extends CoreFlow<I, Context<SupabaseResources & Extra>, S, D> {}