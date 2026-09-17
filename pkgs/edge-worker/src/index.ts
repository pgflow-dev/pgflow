// Export existing queue-based worker
export { createQueueWorker } from './queue/createQueueWorker.js';
export { EdgeWorker } from './EdgeWorker.js';

// Export new flow-based worker
export { createFlowWorker } from './flow/createFlowWorker.js';
export { FlowWorkerLifecycle } from './flow/FlowWorkerLifecycle.js';

// Export platform adapters
export * from './platform/index.js';

// Export types
export type { StepTaskRecord } from '@pgflow/core';
export type { FlowWorkerConfig } from './flow/createFlowWorker.js';
export type { StepWorkerConfig } from './core/workerConfigTypes.js';
export type { StepTaskPollerConfig } from './flow/StepTaskPoller.js';
export { resolveWorkerRouting } from './flow/workerRouting.js';
export type { WorkerRouting } from './flow/workerRouting.js';
export { FlowRoutingMismatchError, FlowShapeMismatchError } from './flow/errors.js';

// Re-export types from the base system
export type {
  Json,
  IExecutor,
  IPoller,
  IMessage,
  ILifecycle,
  IBatchProcessor,
} from './core/types.js';
