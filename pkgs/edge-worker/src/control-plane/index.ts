/**
 * ControlPlane - HTTP API for flow compilation
 *
 * Provides HTTP endpoints for compiling flows to SQL without requiring
 * local Deno runtime or file system access.
 *
 * @example
 * ```typescript
 * // Using namespace import (recommended)
 * import { ControlPlane } from '@pgflow/edge-worker';
 * import * as flows from '../../flows/index.js';
 *
 * ControlPlane.serve(flows);
 * ```
 *
 * @example
 * ```typescript
 * // Using array (legacy)
 * import { ControlPlane } from '@pgflow/edge-worker';
 * import { MyFlow } from '../../flows/my_flow.js';
 *
 * ControlPlane.serve([MyFlow]);
 * ```
 */

import { serveControlPlane } from './server.js';

/**
 * Main ControlPlane API
 */
export const ControlPlane = {
  /**
   * Start the ControlPlane HTTP server
   * @param flowsInput Array or object of flow definitions to register
   */
  serve: serveControlPlane,
};
