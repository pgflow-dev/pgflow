// Export existing queue-based worker
export { createQueueWorker } from './queue/createQueueWorker.js';
export { EdgeWorker } from './EdgeWorker.js';

// Export new flow-based worker
export { createFlowWorker } from './flow/createFlowWorker.js';
export { FlowWorkerLifecycle } from './flow/FlowWorkerLifecycle.js';

// Export ControlPlane for HTTP-based flow compilation
export { ControlPlane } from './control-plane/index.js';

// Export platform adapters
export * from './platform/index.js';

// Export types
export type { StepTaskRecord } from './flow/types.js';
export type { FlowWorkerConfig } from './flow/createFlowWorker.js';
export type { StepTaskPollerConfig } from './flow/StepTaskPoller.js';

// Re-export types from the base system
export type {
  Json,
  IExecutor,
  IPoller,
  IMessage,
  ILifecycle,
  IBatchProcessor,
} from './core/types.js';
