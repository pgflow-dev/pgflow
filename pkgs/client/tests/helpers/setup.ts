import { createClient } from '@supabase/supabase-js';

export function createTestSupabaseClient() {
  return createClient(
    'http://localhost:50521',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'  // Use service_role key for tests
  );
}

export const TEST_ENV = {
  SUPABASE_URL: 'http://localhost:50521',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:50522/postgres'
};

export async function waitForRealtimeReady(channel: any, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Channel not ready within timeout')), timeout);
    
    const checkStatus = () => {
      if (channel.state === 'joined') {
        clearTimeout(timer);
        resolve();
      }
    };
    
    // Check immediately in case already joined
    checkStatus();
    
    // Listen for state changes
    channel.on('presence', {}, () => {}); // forces registration
    channel.on('phx_reply', (event: any) => {
      if (event.payload?.status === 'ok' && event.ref === channel.joinRef()) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}