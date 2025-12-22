import type { PlatformAdapter } from './types.js';
import { SupabasePlatformAdapter } from './SupabasePlatformAdapter.js';
import type { SupabaseResources } from '@pgflow/dsl/supabase';
import type postgres from 'postgres';
import { getPlatformDeps } from './deps.js';

interface AdapterOptions {
  sql?: postgres.Sql;
  connectionString?: string;
}

/**
 * Creates the appropriate platform adapter based on the runtime environment
 */
export function createAdapter(options?: AdapterOptions): PlatformAdapter<SupabaseResources> {
  if (isDenoEnvironment()) {
    // For now, always use SupabasePlatformAdapter for Deno
    // In the future, we could detect Supabase vs other Deno environments
    const adapter = new SupabasePlatformAdapter(options, getPlatformDeps());
    return adapter;
  }

  // For now, only support Deno
  // Later add NodeAdapter, BrowserAdapter, etc.
  throw new Error('Unsupported environment');
}

function isDenoEnvironment(): boolean {
  return typeof Deno !== 'undefined';
}
