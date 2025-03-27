// Export existing queue-based worker
export { createQueueWorker } from './queue/createQueueWorker.ts';
export { EdgeWorker } from './EdgeWorker.ts';

// Export new flow-based worker
export { createFlowWorker } from './flow/createFlowWorker.ts';
export { FlowWorkerLifecycle } from './flow/FlowWorkerLifecycle.ts';

// Export types
export type { StepTaskRecord } from './flow/types.ts';
export type { FlowWorkerConfig } from './flow/createFlowWorker.ts';
export type { StepTaskPollerConfig } from './flow/StepTaskPoller.ts';

// Re-export types from the base system
export type { Json, IExecutor, IPoller, IMessage, ILifecycle, IBatchProcessor } from './core/types.ts';
