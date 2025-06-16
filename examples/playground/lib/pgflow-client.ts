// lib/pgflow-client.ts
import { PgflowClient } from '@pgflow/client';
import { createClient } from '@/utils/supabase/client';

// Create a singleton instance of PgflowClient
let pgflowClient: PgflowClient | null = null;

export function getPgflowClient(): PgflowClient {
  if (!pgflowClient) {
    console.log('Creating new PgflowClient singleton instance');
    const supabase = createClient();
    pgflowClient = new PgflowClient(supabase);
  }
  return pgflowClient;
}