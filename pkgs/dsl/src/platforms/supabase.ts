import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import { 
  Flow as CoreFlow, 
  type AnyInput, 
  type AnySteps, 
  type AnyDeps, 
  EmptySteps, 
  EmptyDeps,
  type Env,
  type UserEnv,
  type ValidEnv
} from '../index.js';
import type { Context } from './index.js';

/**
 * Supabase-specific environment requirements
 */
export interface SupabaseEnv extends Env {
  /**
   * Database URL for pgflow database connection
   */
  EDGE_WORKER_DB_URL: string;
  
  /**
   * Log level for Edge Worker (optional)
   */
  EDGE_WORKER_LOG_LEVEL?: string;
}

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
export type SupabaseContext = Context<SupabaseResources> & { env: SupabaseEnv & ValidEnv<UserEnv> };

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
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Extra extends Record<string, unknown> = {},
  S extends AnySteps = EmptySteps,
  D extends AnyDeps = EmptyDeps,
> extends CoreFlow<I, Context<SupabaseResources & Extra> & { env: SupabaseEnv & ValidEnv<UserEnv> }, S, D> {}