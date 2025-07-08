import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Context object passed to handlers with built-in properties and utilities.
 * 
 * Built-in properties (Phase 1):
 * - env: Environment variables
 * - sql: PostgreSQL client (reused from worker)
 * - rawMessage: pgmq record (defined for queue workers, undefined for flow workers)
 * - anonSupabase: Lazy-loaded anonymous Supabase client (if env vars exist)
 * - serviceSupabase: Lazy-loaded service role Supabase client (if env vars exist)
 * - abortSignal: Simple worker-wide shutdown signal
 */
export interface Context<TPayload extends Json = Json> {
  /**
   * Environment variables available to the handler
   */
  env: Record<string, string | undefined>;

  /**
   * PostgreSQL client for database operations
   */
  sql: Sql;

  /**
   * The raw pgmq message record (only available for queue workers)
   * Will be undefined for flow workers
   */
  rawMessage?: PgmqMessageRecord<TPayload>;

  /**
   * Anonymous Supabase client (lazy-loaded if SUPABASE_URL and SUPABASE_ANON_KEY exist)
   */
  anonSupabase?: SupabaseClient;

  /**
   * Service role Supabase client (lazy-loaded if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY exist)
   */
  serviceSupabase?: SupabaseClient;

  /**
   * Abort signal that fires when the worker is shutting down
   */
  abortSignal: AbortSignal;
}