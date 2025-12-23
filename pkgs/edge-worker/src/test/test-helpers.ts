import type postgres from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyFlow, AllStepInputs, ExtractFlowInput } from '@pgflow/dsl';
import type { SupabaseResources } from '@pgflow/dsl/supabase';
import type { Json } from '../core/types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { 
  SupabaseMessageContext,
  SupabaseStepTaskContext
} from '../core/context.js';
import type { StepTaskRecord } from '../flow/types.js';
import { createServiceSupabaseClient } from '../core/supabase-utils.js';
import { createContextSafeConfig } from '../core/context.js';
import type { QueueWorkerConfig, FlowWorkerConfig } from '../core/workerConfigTypes.js';

/**
 * Creates a full Supabase context for testing message handlers.
 * This mimics what the SupabasePlatformAdapter provides in production.
 */
export function createSupabaseMessageContext<TPayload extends Json = Json>(params: {
  env: Record<string, string | undefined>;
  sql: postgres.Sql;
  abortSignal: AbortSignal;
  rawMessage: PgmqMessageRecord<TPayload>;
  workerConfig?: Readonly<Omit<QueueWorkerConfig, 'sql'>>;
}): SupabaseMessageContext<TPayload> {
  const { env, sql, abortSignal, rawMessage, workerConfig } = params;

  // Validate required environment variables
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required but not defined');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required but not defined');
  }

  // In production, these would be validated at startup
  // For tests, we create them on demand
  const supabase = createServiceSupabaseClient({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey
  });

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

  const defaultWorkerConfig = createContextSafeConfig(resolvedConfig);

  return {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,

    // Message execution context
    rawMessage,
    workerConfig: defaultWorkerConfig,

    // Supabase-specific resources (always present)
    sql,
    supabase
  };
}

/**
 * Creates a full Supabase context for testing step task handlers.
 * This mimics what the SupabasePlatformAdapter provides in production.
 */
export function createSupabaseStepTaskContext<TFlow extends AnyFlow>(params: {
  env: Record<string, string | undefined>;
  sql: postgres.Sql;
  abortSignal: AbortSignal;
  stepTask: StepTaskRecord<TFlow>;
  rawMessage: PgmqMessageRecord<AllStepInputs<TFlow>>;
  flowInput: ExtractFlowInput<TFlow>;
  workerConfig?: Readonly<Omit<FlowWorkerConfig, 'sql'>>;
}): SupabaseStepTaskContext<TFlow> {
  const { env, sql, abortSignal, stepTask, rawMessage, flowInput, workerConfig } = params;

  // Validate required environment variables
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required but not defined');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required but not defined');
  }

  // In production, these would be validated at startup
  // For tests, we create them on demand
  const supabase = createServiceSupabaseClient({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey
  });

  // Provide a safe, frozen workerConfig (default or provided)
  const resolvedConfig = {
    maxConcurrent: 10,
    batchSize: 10,
    visibilityTimeout: 2,
    maxPollSeconds: 2,
    pollIntervalMs: 100,
    ...workerConfig
  };

  const defaultWorkerConfig = createContextSafeConfig(resolvedConfig);

  return {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,

    // Step task execution context
    rawMessage,
    stepTask,
    workerConfig: defaultWorkerConfig,
    flowInput,

    // Supabase-specific resources (always present)
    sql,
    supabase
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
    sql: {} as unknown as postgres.Sql,
    supabase: createMockSupabaseClient(),
    ...overrides
  };
}