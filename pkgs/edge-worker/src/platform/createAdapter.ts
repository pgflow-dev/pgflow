import type { PlatformAdapter } from './types.ts';
import { DenoAdapter } from './DenoAdapter.ts';

/**
 * Creates the appropriate platform adapter based on the runtime environment
 */
export function createAdapter(): PlatformAdapter {
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
