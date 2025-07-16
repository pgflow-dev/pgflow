import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyFlow, AllStepInputs } from '@pgflow/dsl';
import type { SupabaseResources } from '@pgflow/dsl/supabase';
import type { Json } from '../core/types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { 
  SupabaseMessageContext,
  SupabaseStepTaskContext
} from '../core/context.js';
import type { StepTaskRecord } from '../flow/types.js';
import { createAnonSupabaseClient, createServiceSupabaseClient } from '../core/supabase-utils.js';

/**
 * Creates a full Supabase context for testing message handlers.
 * This mimics what the SupabasePlatformAdapter provides in production.
 */
export function createSupabaseMessageContext<TPayload extends Json = Json>(params: {
  env: Record<string, string | undefined>;
  sql: Sql;
  abortSignal: AbortSignal;
  rawMessage: PgmqMessageRecord<TPayload>;
}): SupabaseMessageContext<TPayload> {
  const { env, sql, abortSignal, rawMessage } = params;

  // Validate required environment variables
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required but not defined');
  }
  if (!supabaseAnonKey) {
    throw new Error('SUPABASE_ANON_KEY environment variable is required but not defined');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required but not defined');
  }

  // In production, these would be validated at startup
  // For tests, we create them on demand
  const anonSupabase = createAnonSupabaseClient({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey
  });

  const serviceSupabase = createServiceSupabaseClient({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey
  });

  return {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,
    
    // Message execution context
    rawMessage,
    
    // Supabase-specific resources (always present)
    sql,
    anonSupabase,
    serviceSupabase
  };
}

/**
 * Creates a full Supabase context for testing step task handlers.
 * This mimics what the SupabasePlatformAdapter provides in production.
 */
export function createSupabaseStepTaskContext<TFlow extends AnyFlow>(params: {
  env: Record<string, string | undefined>;
  sql: Sql;
  abortSignal: AbortSignal;
  stepTask: StepTaskRecord<TFlow>;
  rawMessage: PgmqMessageRecord<AllStepInputs<TFlow>>;
}): SupabaseStepTaskContext<TFlow> {
  const { env, sql, abortSignal, stepTask, rawMessage } = params;

  // Validate required environment variables
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required but not defined');
  }
  if (!supabaseAnonKey) {
    throw new Error('SUPABASE_ANON_KEY environment variable is required but not defined');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required but not defined');
  }

  // In production, these would be validated at startup
  // For tests, we create them on demand
  const anonSupabase = createAnonSupabaseClient({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey
  });

  const serviceSupabase = createServiceSupabaseClient({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey
  });

  return {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,
    
    // Step task execution context
    rawMessage,
    stepTask,
    
    // Supabase-specific resources (always present)
    sql,
    anonSupabase,
    serviceSupabase
  };
}

/**
 * Creates a mock Supabase client for testing
 */
export function createMockSupabaseClient(): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) })
  } as unknown as SupabaseClient;
}

/**
 * Creates mock Supabase resources for testing
 */
export function createMockSupabaseResources(overrides?: Partial<SupabaseResources>): SupabaseResources {
  return {
    sql: {} as unknown as Sql,
    anonSupabase: createMockSupabaseClient(),
    serviceSupabase: createMockSupabaseClient(),
    ...overrides
  };
}