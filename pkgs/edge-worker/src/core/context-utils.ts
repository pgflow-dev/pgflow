import type { Sql } from 'postgres';
import type { Context } from './context.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { Json } from './types.js';
import { createAnonSupabaseClient, createServiceSupabaseClient } from './supabase-factories.js';
import { memoize } from './memoize.js';

interface CreateContextOptions {
  env: Record<string, string | undefined>;
  sql: Sql;
  abortSignal: AbortSignal;
}

interface CreateQueueContextOptions<TPayload extends Json> extends CreateContextOptions {
  rawMessage: PgmqMessageRecord<TPayload>;
}

/**
 * Creates a context object for queue workers (MessageExecutor)
 * Includes the raw pgmq message record
 */
export function createQueueWorkerContext<TPayload extends Json>(
  options: CreateQueueContextOptions<TPayload>
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

/**
 * Creates a context object for flow workers (StepTaskExecutor)
 * Does NOT include the raw message (undefined)
 */
export function createFlowWorkerContext(options: CreateContextOptions): Context {
  const { env, sql, abortSignal } = options;
  
  // Memoized Supabase client factories
  const getAnonSupabase = memoize(() => createAnonSupabaseClient({ env }));
  const getServiceSupabase = memoize(() => createServiceSupabaseClient({ env }));
  
  const context: Context = {
    env,
    sql,
    abortSignal,
    rawMessage: undefined, // Always undefined for flow workers
    get anonSupabase() {
      return getAnonSupabase();
    },
    get serviceSupabase() {
      return getServiceSupabase();
    },
  };
  
  return context;
}