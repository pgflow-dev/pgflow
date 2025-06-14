/**
 * Internal exports for experimental use only.
 * These APIs are unstable and may change without notice.
 * 
 * DO NOT use these in production code unless you know what you're doing.
 * All internal components are exported and organized by namespace.
 */

// Core namespace - all internal worker infrastructure
export * as core from './_internal/core.js';

// Platform namespace - adapters and logging
export * as platform from './_internal/platform.js';

// Flow namespace - flow-specific worker components
export * as flow from './_internal/flow.js';

// Queue namespace - queue-based worker components
export * as queue from './_internal/queue.js';

// Also export EdgeWorker from root
export { EdgeWorker } from './EdgeWorker.js';