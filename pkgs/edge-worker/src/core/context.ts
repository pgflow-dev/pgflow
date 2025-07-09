/* DSL‐level ------------------------------------------------------------ */
import type { BaseContext, AnyFlow, AllStepInputs } from '@pgflow/dsl';
import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { StepTaskRecord } from '../flow/types.js';

/* ──────────────────────────────────────────────────────────────────────
   1.  PLATFORM LAYER
   --------------------------------------------------------------------- */

/**
 * Context guaranteed by **any** concrete platform adapter
 * (`sql`, `anonSupabase`, … are filled in by that adapter).
 */
export type PlatformContext<
  TResources extends Record<string, unknown>
> = BaseContext & TResources;

/* ──────────────────────────────────────────────────────────────────────
   2.  EXECUTION LAYER
   --------------------------------------------------------------------- */

export interface MessageExecution<TPayload extends Json = Json> {
  rawMessage: PgmqMessageRecord<TPayload>;
}

export interface StepTaskExecution<TFlow extends AnyFlow = AnyFlow> {
  rawMessage: PgmqMessageRecord<AllStepInputs<TFlow>>;
  stepTask  : StepTaskRecord<TFlow>;
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

export interface StepTaskWithMessage<TFlow extends AnyFlow> {
  msg_id : number;
  message: PgmqMessageRecord<AllStepInputs<TFlow>>;
  task   : StepTaskRecord<TFlow>;
}

/* ──────────────────────────────────────────────────────────────────────
   4.  LEGACY COMPATIBILITY (for backward compatibility only)
   --------------------------------------------------------------------- */

/**
 * @deprecated Use specific context types instead: MessageContext, StepTaskContext
 * This legacy alias is for backward compatibility only
 */
export type Context = BaseContext;

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