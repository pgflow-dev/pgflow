// Re-export base context types for platform implementations
export type { BaseContext, Context } from '../index.js';

// Re-export step-queue deployment metadata for platform entry points (#651)
export {
  withStepQueues,
  isStepQueuedFlow,
  StepQueuedFlow,
  StepQueueError,
  resolveStepQueueName,
  resolveQueueRouteMap,
  MAX_PGMQ_QUEUE_NAME_LENGTH,
  FlowQueueNameError,
  StepQueueNameError,
  EmptyStepQueuedFlowError,
  DuplicateStepSlugError,
  DuplicateQueueRouteError,
} from '../index.js';
export type { QueueMode, StepRoute } from '../index.js';