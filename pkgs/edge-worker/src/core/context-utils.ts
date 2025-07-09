import type { Sql } from 'postgres';
import type { AnyFlow } from '@pgflow/dsl';
import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { 
  MessageHandlerContext, 
  StepTaskHandlerContext,
  StepTaskWithMessage 
} from './context.js';
import type { StepTaskRecord } from '../flow/types.js';
import { createAnonSupabaseClient, createServiceSupabaseClient } from './supabase-utils.js';

/**
 * Context creation parameters for queue workers
 */
export interface QueueWorkerContextParams<TPayload extends Json = Json> {
  env: Record<string, string | undefined>;
  sql: Sql;
  abortSignal: AbortSignal;
  rawMessage: PgmqMessageRecord<TPayload>;
}

/**
 * Context creation parameters for flow workers
 */
export interface FlowWorkerContextParams<TFlow extends AnyFlow> {
  env: Record<string, string | undefined>;
  sql: Sql;
  abortSignal: AbortSignal;
  taskWithMessage: StepTaskWithMessage<TFlow>;
}

/**
 * Creates a message handler context for queue workers
 * This function provides a simplified interface for testing
 */
export function createQueueWorkerContext<TPayload extends Json = Json>(
  params: QueueWorkerContextParams<TPayload>
): MessageHandlerContext<TPayload, {
  sql: Sql;
  anonSupabase?: any;
  serviceSupabase?: any;
}> {
  const { env, sql, abortSignal, rawMessage } = params;

  const context: MessageHandlerContext<TPayload, {
    sql: Sql;
    anonSupabase?: any;
    serviceSupabase?: any;
  }> = {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,
    
    // Message execution context
    rawMessage,
    
    // Supabase-specific resources
    sql,
  };

  // Add Supabase clients if environment variables are present
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    context.anonSupabase = createAnonSupabaseClient(env);
  }

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    context.serviceSupabase = createServiceSupabaseClient(env);
  }

  return context;
}

/**
 * Creates a step task handler context for flow workers
 * This function provides a simplified interface for testing
 */
export function createFlowWorkerContext<TFlow extends AnyFlow>(
  params: FlowWorkerContextParams<TFlow>
): StepTaskHandlerContext<TFlow, {
  sql: Sql;
  anonSupabase?: any;
  serviceSupabase?: any;
}> {
  const { env, sql, abortSignal, taskWithMessage } = params;

  const context: StepTaskHandlerContext<TFlow, {
    sql: Sql;
    anonSupabase?: any;
    serviceSupabase?: any;
  }> = {
    // Core platform resources
    env,
    shutdownSignal: abortSignal,
    
    // Step task execution context
    rawMessage: taskWithMessage.message,
    stepTask: taskWithMessage.task,
    
    // Supabase-specific resources
    sql,
  };

  // Add Supabase clients if environment variables are present
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    context.anonSupabase = createAnonSupabaseClient(env);
  }

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    context.serviceSupabase = createServiceSupabaseClient(env);
  }

  return context;
}

/**
 * Simplified context creation for step task context tests
 */
export function createStepTaskContext<TFlow extends AnyFlow>(params: {
  env: Record<string, string | undefined>;
  sql: Sql;
  abortSignal: AbortSignal;
  stepTask: StepTaskRecord<TFlow>;
  rawMessage: PgmqMessageRecord<any>;
}): StepTaskHandlerContext<TFlow, {
  sql: Sql;
  anonSupabase?: any;
  serviceSupabase?: any;
}> {
  return createFlowWorkerContext({
    env: params.env,
    sql: params.sql,
    abortSignal: params.abortSignal,
    taskWithMessage: {
      message: params.rawMessage,
      task: params.stepTask
    }
  });
}