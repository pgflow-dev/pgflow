/**
 * ControlPlane - HTTP API for flow compilation
 *
 * Provides HTTP endpoints for compiling flows to SQL without requiring
 * local Deno runtime or file system access.
 *
 * @example
 * ```typescript
 * import { ControlPlane } from '@pgflow/edge-worker';
 * import { flows } from './flows.ts';
 *
 * ControlPlane.serve(flows);
 * ```
 */

import { serveControlPlane } from './server.js';

/**
 * Main ControlPlane API
 */
export const ControlPlane = {
  /**
   * Start the ControlPlane HTTP server
   * @param flows Array of flow definitions to register
   */
  serve: serveControlPlane,
};
