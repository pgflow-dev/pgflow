import type { PlatformAdapter } from './types.js';
import { DenoAdapter } from './DenoAdapter.js';

/**
 * Creates the appropriate platform adapter based on the runtime environment
 */
export async function createAdapter(): Promise<PlatformAdapter> {
  if (isDenoEnvironment()) {
    const adapter = new DenoAdapter();
    return adapter;
  }

  // For now, only support Deno
  // Later add NodeAdapter, BrowserAdapter, etc.
  throw new Error('Unsupported environment');
}

function isDenoEnvironment(): boolean {
  return typeof Deno !== 'undefined';
}
