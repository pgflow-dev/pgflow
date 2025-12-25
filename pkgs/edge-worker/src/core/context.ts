/* DSL‐level ------------------------------------------------------------ */
import type { BaseContext, AnyFlow, AllStepInputs, ExtractFlowInput } from '@pgflow/dsl';
import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { StepTaskRecord } from '../flow/types.js';
import type { QueueWorkerConfig, FlowWorkerConfig } from './workerConfigTypes.js';

/* ──────────────────────────────────────────────────────────────────────
   1.  PLATFORM LAYER
   --------------------------------------------------------------------- */

/**
 * Context guaranteed by **any** concrete platform adapter
 * (`sql`, `supabase`, … are filled in by that adapter).
 */
export type PlatformContext<
  TResources extends Record<string, unknown>
> = BaseContext & TResources;

/* ──────────────────────────────────────────────────────────────────────
   2.  EXECUTION LAYER
   --------------------------------------------------------------------- */

export interface MessageExecution<TPayload extends Json = Json> {
  rawMessage: PgmqMessageRecord<TPayload>;
  workerConfig: Readonly<Omit<QueueWorkerConfig, 'sql'>>;
}

/**
 * Execution context for step task handlers.
 *
 * Note: flowInput is a Promise to support lazy loading. Only root non-map steps
 * receive flow_input from SQL; other step types lazy-load it on demand.
 */
export interface StepTaskExecution<TFlow extends AnyFlow = AnyFlow> {
  rawMessage: PgmqMessageRecord<AllStepInputs<TFlow>>;
  stepTask  : StepTaskRecord<TFlow>;
  workerConfig: Readonly<Omit<FlowWorkerConfig, 'sql'>>;
  flowInput: Promise<ExtractFlowInput<TFlow>>;
}

/** Message handler context for any platform */
export type MessageContext<
  TPayload   extends Json,
  TResources extends Record<string, unknown>
> = PlatformContext<TResources> & MessageExecution<TPayload>;

/** Step-task handler context for any platform */
export type StepTaskContext<
  TFlow      extends AnyFlow,
  TResources extends Record<string, unknown>
> = PlatformContext<TResources> & StepTaskExecution<TFlow>;

/* ──────────────────────────────────────────────────────────────────────
   3.  UTILITIES
   --------------------------------------------------------------------- */

/**
 * Combined task and message data from polling.
 *
 * Note: flowInput is nullable because start_tasks only provides it for root
 * non-map steps. The executor will create a Promise that either resolves
 * immediately (if provided) or lazy-loads from the runs table.
 */
export interface StepTaskWithMessage<TFlow extends AnyFlow> {
  msg_id : number;
  message: PgmqMessageRecord<AllStepInputs<TFlow>>;
  task   : StepTaskRecord<TFlow>;
  flowInput: ExtractFlowInput<TFlow> | null;
}

import { deepClone, deepFreeze } from './deepUtils.js';

/**
 * Creates a context-safe version of worker config by excluding sql connection,
 * deep cloning, and deep freezing the result to prevent modification by handlers
 */
export function createContextSafeConfig<T extends Record<string, unknown>>(
  config: T
): Readonly<T extends { sql: unknown } ? Omit<T, 'sql'> : T> {
  const { sql, ...safeConfig } = config as T & { sql?: unknown };
  void sql;
  const clonedConfig = deepClone(safeConfig);
  return deepFreeze(clonedConfig) as Readonly<T extends { sql: unknown } ? Omit<T, 'sql'> : T>;
}

/* ──────────────────────────────────────────────────────────────────────
   4.  LEGACY COMPATIBILITY (for backward compatibility only)
   --------------------------------------------------------------------- */


// Re-export legacy types for backward compatibility
export type MessageHandlerContext<
  TPayload extends Json = Json,
  TPlatformExtras extends Record<string, unknown> = Record<string, unknown>
> = MessageContext<TPayload, TPlatformExtras>;

export type StepTaskHandlerContext<
  TFlow extends AnyFlow,
  TPlatformExtras extends Record<string, unknown> = Record<string, unknown>
> = StepTaskContext<TFlow, TPlatformExtras>;

// Legacy Supabase context aliases (for backward compatibility)
import type { SupabaseResources } from '@pgflow/dsl/supabase';

export type SupabaseMessageContext<TPayload extends Json = Json> = 
  MessageHandlerContext<TPayload, SupabaseResources>;

export type SupabaseStepTaskContext<TFlow extends AnyFlow> = 
  StepTaskHandlerContext<TFlow, SupabaseResources>;