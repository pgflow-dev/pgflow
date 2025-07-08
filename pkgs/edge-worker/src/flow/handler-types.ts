import type { Context } from '../core/context.js';
import type { Json } from '../core/types.js';

/**
 * Updated step handler function type that supports optional context parameter
 * for backward compatibility
 */
export type StepHandlerWithContext<TInput extends Json, TOutput extends Json> = 
  | ((input: TInput) => TOutput | Promise<TOutput>)
  | ((input: TInput, context: Context) => TOutput | Promise<TOutput>);