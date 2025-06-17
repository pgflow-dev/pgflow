// Browser-specific entry point
export { PgflowClient } from './lib/PgflowClient.js';
export { FlowRunStatus, FlowStepStatus } from './lib/types.js';
export * from './lib/types.js';

// Import the PgflowClient constructor for the factory
import { PgflowClient } from './lib/PgflowClient.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Factory function for creating PgflowClient instances
export function createClient(supabaseClient: SupabaseClient) {
  return new PgflowClient(supabaseClient);
}