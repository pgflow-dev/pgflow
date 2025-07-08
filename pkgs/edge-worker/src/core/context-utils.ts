import type { Sql } from 'postgres';
import type { Context } from './context.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { Json } from './types.js';
import { createAnonSupabaseClient, createServiceSupabaseClient } from './supabase-factories.js';
import { memoize } from './memoize.js';

interface CreateContextOptions<TPayload extends Json = Json> {
  env: Record<string, string | undefined>;
  sql: Sql;
  abortSignal: AbortSignal;
  rawMessage?: PgmqMessageRecord<TPayload>;
}

/**
 * Creates a context object for workers with all required properties
 * @param options - Parameters for creating the context
 * @returns Context object with lazy-loaded Supabase clients
 */
export function createContext<TPayload extends Json = Json>(
  options: CreateContextOptions<TPayload>
): Context<TPayload> {
  const { env, sql, abortSignal, rawMessage } = options;
  
  // Memoized Supabase client factories
  const getAnonSupabase = memoize(() => createAnonSupabaseClient({ env }));
  const getServiceSupabase = memoize(() => createServiceSupabaseClient({ env }));
  
  const context: Context<TPayload> = {
    env,
    sql,
    abortSignal,
    rawMessage,
    get anonSupabase() {
      return getAnonSupabase();
    },
    get serviceSupabase() {
      return getServiceSupabase();
    },
  };
  
  return context;
}