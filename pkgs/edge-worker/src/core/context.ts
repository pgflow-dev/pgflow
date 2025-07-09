import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { StepTaskRecord } from '../flow/types.js';
import type { AnyFlow, AllStepInputs } from '@pgflow/dsl';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Core platform resources that every platform MUST provide
 */
export interface CorePlatformResources {
  /**
   * Environment variables available to the handler
   */
  env: Record<string, string | undefined>;

  /**
   * Abort signal that fires when the worker is shutting down
   */
  shutdownSignal: AbortSignal;
}

/**
 * Per-execution context for message handlers
 */
export interface MessageExecution<TPayload extends Json = Json> {
  /**
   * The raw pgmq message record
   */
  rawMessage: PgmqMessageRecord<TPayload>;
}

/**
 * Per-execution context for step task handlers
 */
export interface StepTaskExecution<TFlow extends AnyFlow> {
  /**
   * The raw pgmq message record
   */
  rawMessage: PgmqMessageRecord<AllStepInputs<TFlow>>;

  /**
   * The step task record
   */
  stepTask: StepTaskRecord<TFlow>;
}

/**
 * Generic message handler context with platform extras
 */
export type MessageHandlerContext<
  TPayload extends Json = Json,
  TPlatformExtras extends object = Record<string, never>
> = CorePlatformResources & MessageExecution<TPayload> & TPlatformExtras;

/**
 * Generic step task handler context with platform extras
 */
export type StepTaskHandlerContext<
  TFlow extends AnyFlow,
  TPlatformExtras extends object = Record<string, never>
> = CorePlatformResources & StepTaskExecution<TFlow> & TPlatformExtras;

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
 * User-facing context type for message handlers on Supabase
 */
export type SupabaseMessageContext<TPayload extends Json = Json> = 
  MessageHandlerContext<TPayload, SupabaseResources>;

/**
 * User-facing context type for step task handlers on Supabase
 */
export type SupabaseStepTaskContext<TFlow extends AnyFlow> = 
  StepTaskHandlerContext<TFlow, SupabaseResources>;

/**
 * Generic context type for backward compatibility with tests
 * This will be gradually replaced with more specific context types
 */
export type Context<TPayload extends Json = Json> = MessageHandlerContext<TPayload, Partial<SupabaseResources>>;


/**
 * Pair a step task with its message for flow workers
 */
export interface StepTaskWithMessage<TFlow extends AnyFlow> {
  message: PgmqMessageRecord<AllStepInputs<TFlow>>;
  task: StepTaskRecord<TFlow>;
}

