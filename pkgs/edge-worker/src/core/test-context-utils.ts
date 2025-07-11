import type { Json } from './types.js';
import type {
  AnyFlow, AllStepInputs
} from '@pgflow/dsl';
import type {
  MessageContext, StepTaskContext
} from './context.js';
import type { StepTaskRecord } from '../flow/types.js';
import type { PgmqMessageRecord } from '../queue/types.js';

export function createMessageTestContext<
  TPayload extends Json,
  TResources extends Record<string, unknown>
>(p: {
  env          : Record<string, string | undefined>;
  abortSignal  : AbortSignal;
  rawMessage   : PgmqMessageRecord<TPayload>;
} & TResources): MessageContext<TPayload, TResources> {
  const { abortSignal, env, rawMessage, ...res } = p;
  return { env, shutdownSignal: abortSignal, rawMessage, ...res } as unknown as MessageContext<TPayload, TResources>;
}

export function createStepTaskTestContext<
  TFlow extends AnyFlow,
  TResources extends Record<string, unknown>
>(p: {
  env          : Record<string, string | undefined>;
  abortSignal  : AbortSignal;
  stepTask     : StepTaskRecord<TFlow>;
  rawMessage   : PgmqMessageRecord<AllStepInputs<TFlow>>;
} & TResources): StepTaskContext<TFlow, TResources> {
  const { abortSignal, env, stepTask, rawMessage, ...res } = p;
  return { env, shutdownSignal: abortSignal, stepTask, rawMessage, ...res } as unknown as StepTaskContext<TFlow, TResources>;
}

// Legacy aliases for backward compatibility
export const createTestMessageContext = createMessageTestContext;
export const createTestStepTaskContext = createStepTaskTestContext;