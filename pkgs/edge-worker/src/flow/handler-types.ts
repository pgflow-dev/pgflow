import type { AnyFlow } from '@pgflow/dsl';
import type { Json } from '../core/types.js';
import type { SupabaseStepTaskContext } from '../core/context.js';

/**
 * Supabase-specific step task handler function with typed context
 */
export type SupabaseStepTaskHandlerFn<TInput extends Json, TOutput extends Json, TFlow extends AnyFlow> = 
  (input: TInput, context: SupabaseStepTaskContext<TFlow>) => TOutput | Promise<TOutput>;