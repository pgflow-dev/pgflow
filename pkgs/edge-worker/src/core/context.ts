import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { StepTaskRecord } from '../flow/types.js';
import type { AnyFlow, AllStepInputs, BaseContext } from '@pgflow/dsl';
import type { SupabaseResources } from '@pgflow/dsl/supabase';

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
  TPlatformExtras extends Record<string, unknown> = Record<string, unknown>
> = BaseContext & MessageExecution<TPayload> & TPlatformExtras;

/**
 * Generic step task handler context with platform extras
 */
export type StepTaskHandlerContext<
  TFlow extends AnyFlow,
  TPlatformExtras extends Record<string, unknown> = Record<string, unknown>
> = BaseContext & StepTaskExecution<TFlow> & TPlatformExtras;

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
 * Pair a step task with its message for flow workers
 */
export interface StepTaskWithMessage<TFlow extends AnyFlow> {
  message: PgmqMessageRecord<AllStepInputs<TFlow>>;
  task: StepTaskRecord<TFlow>;
}

