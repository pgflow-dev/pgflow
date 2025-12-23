import type postgres from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyFlow } from '@pgflow/dsl';
import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { 
  StepTaskWithMessage
} from './context.js';
import { createContextSafeConfig } from './context.js';
import type { QueueWorkerConfig, FlowWorkerConfig } from './workerConfigTypes.js';
import type { SupabaseEnv } from '@pgflow/dsl/supabase';
import { createServiceSupabaseClient } from './supabase-utils.js';

/**
 * Creates a test context that mimics what SupabasePlatformAdapter provides.
 * For queue workers that only deal with messages.
 */
export function createQueueWorkerContext<TPayload extends Json>(params: {
  env: SupabaseEnv;
  sql: postgres.Sql;
  abortSignal: AbortSignal;
  rawMessage: PgmqMessageRecord<TPayload>;
  workerConfig?: Readonly<Omit<QueueWorkerConfig, 'sql'>>;
}) {
  const { env, sql, abortSignal, rawMessage, workerConfig } = params;

  // Create Supabase client if env vars exist, otherwise create mock
  const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceSupabaseClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
      })
    : createMockSupabaseClient();

  // Provide a safe, frozen workerConfig (default or provided)
  const resolvedConfig = {
    queueName: 'test-queue',
    maxConcurrent: 10,
    maxPollSeconds: 5,
    pollIntervalMs: 200,
    batchSize: 10,
    visibilityTimeout: 30,
    retry: { strategy: 'fixed' as const, limit: 3, baseDelay: 1 },
    ...workerConfig
  };

  return {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,

    // Message execution context
    rawMessage,
    workerConfig: createContextSafeConfig(resolvedConfig),

    // Supabase-specific resources (always present in Phase 1)
    sql,
    supabase
  };
}

/**
 * Creates a test context for flow workers.
 * Note: In production flow workers, rawMessage is provided via StepTaskWithMessage.
 * For testing, we allow passing it separately or via taskWithMessage.
 */
export function createFlowWorkerContext<TFlow extends AnyFlow = AnyFlow>(params: {
  env: SupabaseEnv;
  sql: postgres.Sql;
  abortSignal: AbortSignal;
  taskWithMessage?: StepTaskWithMessage<TFlow>;
  workerConfig?: Readonly<Omit<FlowWorkerConfig, 'sql'>>;
}) {
  const { env, sql, abortSignal, taskWithMessage, workerConfig } = params;

  // Create Supabase client if env vars exist, otherwise create mock
  const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceSupabaseClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
      })
    : createMockSupabaseClient();

  if (!taskWithMessage) {
    throw new Error('Flow worker context requires taskWithMessage');
  }

  // Provide a safe, frozen workerConfig (default or provided)
  const resolvedConfig = {
    maxConcurrent: 10,
    batchSize: 10,
    visibilityTimeout: 2,
    maxPollSeconds: 2,
    pollIntervalMs: 100,
    ...workerConfig
  };

  return {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,

    // Step task execution context
    rawMessage: taskWithMessage.message,
    stepTask: taskWithMessage.task,
    flowInput: taskWithMessage.flowInput,
    workerConfig: createContextSafeConfig(resolvedConfig),

    // Supabase-specific resources (always present in Phase 1)
    sql,
    supabase
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