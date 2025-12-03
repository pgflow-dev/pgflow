import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { createHash } from 'crypto';
import { log as debugLog } from './__tests__/helpers/debug';

const log = (...args: unknown[]) => debugLog('[GLOBAL SETUP]', ...args);

export async function setup() {
  // Create a hash-based channel name with only alphanumeric characters
  const timestamp = Date.now().toString();
  const random = Math.random().toString();
  const hash = createHash('sha1').update(timestamp + random).digest('hex');
  const channelName = `setup${hash.substring(0, 16)}`; // Use first 16 chars of hash
  log(`Using random channel: ${channelName}`);

  const supabaseUrl = 'http://localhost:50521';
  const pgUrl = 'postgresql://postgres:postgres@localhost:50522/postgres';

  log('Checking Supabase availability...');

  // Check if Supabase is reachable
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, { method: 'HEAD' });
    log(`Supabase REST API response: ${response.status}`);
  } catch (fetchError) {
    console.error('[GLOBAL SETUP] ❌ Failed to reach Supabase REST API:', fetchError instanceof Error ? fetchError.message : fetchError);
    console.error('[GLOBAL SETUP] Is Supabase running on port 50521?');
    process.exit(1);
  }

  log('Creating Supabase client...');
  const supabase = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU');

  log('Creating PostgreSQL connection...');
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const sql = postgres(pgUrl, { prepare: false, onnotice: () => {} });

  const channel = supabase.channel(channelName);
  const events: unknown[] = [];

  try {
    log('Testing PostgreSQL connection...');
    try {
      await sql`SELECT 1`;
      log('✓ PostgreSQL connection successful');
    } catch (pgError) {
      console.error('[GLOBAL SETUP] ❌ Failed to connect to PostgreSQL:', pgError instanceof Error ? pgError.message : pgError);
      console.error('[GLOBAL SETUP] Is PostgreSQL running on port 50522?');
      throw pgError;
    }

    log('Setting up broadcast listener...');
    channel.on('broadcast', { event: '*' }, (p) => {
      log('Received broadcast event:', p);
      events.push(p);
    });

    log('Subscribing to channel...');
    await new Promise<void>((ok, fail) => {
      const t = setTimeout(() => {
        console.error('[GLOBAL SETUP] ❌ Channel subscription timed out after 10s');
        fail(new Error('Channel subscription timeout after 10s'));
      }, 10000);

      channel.subscribe((s) => {
        log(`Channel status: ${s}`);
        if (s === 'SUBSCRIBED') {
          log('✓ Channel subscribed successfully');
          clearTimeout(t);
          ok();
        }
        if (s === 'TIMED_OUT') {
          console.error('[GLOBAL SETUP] ❌ Channel subscription timed out (status: TIMED_OUT)');
          clearTimeout(t);
          fail(new Error('Channel status: TIMED_OUT'));
        }
        if (s === 'CHANNEL_ERROR') {
          console.error('[GLOBAL SETUP] ❌ Channel error occurred (status: CHANNEL_ERROR)');
          console.error('[GLOBAL SETUP] This usually means the realtime server is not accessible');
          console.error('[GLOBAL SETUP] Check if Supabase realtime is running on ws://localhost:50521');
          clearTimeout(t);
          fail(new Error('Channel status: CHANNEL_ERROR'));
        }
      });
    });

    // Add stabilization delay for cold channels to fully establish routing
    // Use 200ms instead of 75ms to ensure reliable routing in CI environments
    log('Channel subscribed, waiting 200ms for stabilization...');
    await new Promise(resolve => setTimeout(resolve, 200));
    log('Stabilization complete');

    log('Sending test message via realtime.send()...');
    await sql`SELECT realtime.send('{}', 'e', ${channelName}, false)`;
    log('✓ Message sent');

    log('Waiting for broadcast event (timeout: 10s)...');
    const start = Date.now();
    while (events.length === 0 && Date.now() - start < 10000) {
      await new Promise((ok) => setTimeout(ok, 100));
    }

    if (events.length === 0) {
      console.error('[GLOBAL SETUP] ❌ No events received after 10s');
      console.error('[GLOBAL SETUP] Message was sent but not received - realtime routing may be broken');
      throw new Error('realtime.send() failed - no events received');
    }

    log(`✓ Received ${events.length} event(s)`);
    console.log('[GLOBAL SETUP] ✅ Connectivity check passed');
  } catch (e) {
    console.error('\n❌ Supabase connectivity check failed');
    console.error('Error:', e instanceof Error ? e.message : e);
    console.error('\nTroubleshooting:');
    console.error('  1. Check if Supabase is running: docker ps | grep supabase');
    console.error('  2. Check Supabase logs: supabase status');
    console.error('  3. Try restarting: supabase stop && supabase start');
    console.error('  4. Verify ports 50521 (API) and 50522 (PostgreSQL) are accessible\n');
    process.exit(1);
  } finally {
    log('Cleaning up...');
    await supabase.removeChannel(channel);
    await sql.end();
    log('Cleanup complete');
  }
}

export async function teardown() {
  // Nothing to clean up globally
}