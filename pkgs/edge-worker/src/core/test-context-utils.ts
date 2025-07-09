import type { AnyFlow, AllStepInputs } from '@pgflow/dsl';
import type { Json } from './types.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { 
  MessageHandlerContext, 
  StepTaskHandlerContext
} from './context.js';
import type { StepTaskRecord } from '../flow/types.js';

/**
 * Creates a generic test context for message handlers.
 * This is platform-agnostic and allows tests to provide any resources they need.
 * For Phase 1, resources are spread directly into the context.
 */
export function createTestMessageContext<TPayload extends Json = Json, TResources extends Record<string, unknown> = Record<string, never>>(params: {
  env: Record<string, string | undefined>;
  abortSignal: AbortSignal;
  rawMessage: PgmqMessageRecord<TPayload>;
} & TResources): MessageHandlerContext<TPayload, TResources> {
  const { env, abortSignal, rawMessage, ...resources } = params;
  return {
    env,
    shutdownSignal: abortSignal,
    rawMessage,
    ...resources
  } as MessageHandlerContext<TPayload, TResources>;
}

/**
 * Creates a generic test context for step task handlers.
 * This is platform-agnostic and allows tests to provide any resources they need.
 * For Phase 1, resources are spread directly into the context.
 */
export function createTestStepTaskContext<TFlow extends AnyFlow, TResources extends Record<string, unknown> = Record<string, never>>(params: {
  env: Record<string, string | undefined>;
  abortSignal: AbortSignal;
  stepTask: StepTaskRecord<TFlow>;
  rawMessage: PgmqMessageRecord<AllStepInputs<TFlow>>;
} & TResources): StepTaskHandlerContext<TFlow, TResources> {
  const { env, abortSignal, stepTask, rawMessage, ...resources } = params;
  return {
    env,
    shutdownSignal: abortSignal,
    rawMessage,
    stepTask,
    ...resources
  } as StepTaskHandlerContext<TFlow, TResources>;
}