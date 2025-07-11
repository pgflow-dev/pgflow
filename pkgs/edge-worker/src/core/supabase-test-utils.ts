import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyFlow } from '@pgflow/dsl';
import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { 
  StepTaskWithMessage
} from './context.js';
import type { SupabaseEnv } from '@pgflow/dsl/supabase';
import { createAnonSupabaseClient, createServiceSupabaseClient } from './supabase-utils.js';

/**
 * Creates a test context that mimics what SupabasePlatformAdapter provides.
 * For queue workers that only deal with messages.
 */
export function createQueueWorkerContext<TPayload extends Json>(params: {
  env: SupabaseEnv;
  sql: Sql;
  abortSignal: AbortSignal;
  rawMessage: PgmqMessageRecord<TPayload>;
}) {
  const { env, sql, abortSignal, rawMessage } = params;

  // Create Supabase clients if env vars exist, otherwise create mocks
  const anonSupabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
    ? createAnonSupabaseClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
      })
    : createMockSupabaseClient();

  const serviceSupabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceSupabaseClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
      })
    : createMockSupabaseClient();

  return {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,
    
    // Message execution context
    rawMessage,
    
    // Supabase-specific resources (always present in Phase 1)
    sql,
    anonSupabase,
    serviceSupabase
  };
}

/**
 * Creates a test context for flow workers.
 * Note: In production flow workers, rawMessage is provided via StepTaskWithMessage.
 * For testing, we allow passing it separately or via taskWithMessage.
 */
export function createFlowWorkerContext<TFlow extends AnyFlow = AnyFlow>(params: {
  env: SupabaseEnv;
  sql: Sql;
  abortSignal: AbortSignal;
  taskWithMessage?: StepTaskWithMessage<TFlow>;
}) {
  const { env, sql, abortSignal, taskWithMessage } = params;

  // Create Supabase clients if env vars exist, otherwise create mocks
  const anonSupabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
    ? createAnonSupabaseClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
      })
    : createMockSupabaseClient();

  const serviceSupabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceSupabaseClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
      })
    : createMockSupabaseClient();

  if (!taskWithMessage) {
    throw new Error('Flow worker context requires taskWithMessage');
  }

  return {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,
    
    // Step task execution context
    rawMessage: taskWithMessage.message,
    stepTask: taskWithMessage.task,
    
    // Supabase-specific resources (always present in Phase 1)
    sql,
    anonSupabase,
    serviceSupabase
  };
}

/**
 * Creates a mock Supabase client for testing
 */
function createMockSupabaseClient(): SupabaseClient {
  return {
    from: () => ({ 
      select: () => ({ 
        eq: () => Promise.resolve({ data: [], error: null }) 
      }) 
    })
  } as unknown as SupabaseClient;
}