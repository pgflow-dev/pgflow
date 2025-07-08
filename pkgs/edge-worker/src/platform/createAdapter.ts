import type { PlatformAdapter } from './types.js';
import { SupabasePlatformAdapter } from './SupabasePlatformAdapter.js';

/**
 * Creates the appropriate platform adapter based on the runtime environment
 */
export function createAdapter(): PlatformAdapter {
  if (isDenoEnvironment()) {
    // For now, always use SupabasePlatformAdapter for Deno
    // In the future, we could detect Supabase vs other Deno environments
    const adapter = new SupabasePlatformAdapter();
    return adapter;
  }

  // For now, only support Deno
  // Later add NodeAdapter, BrowserAdapter, etc.
  throw new Error('Unsupported environment');
}

function isDenoEnvironment(): boolean {
  return typeof Deno !== 'undefined';
}
