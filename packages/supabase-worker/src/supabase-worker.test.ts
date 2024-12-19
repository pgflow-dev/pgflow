import { supabaseWorker } from './supabase-worker.ts';
import { assertEquals } from 'https://deno.land/std@0.172.0/testing/asserts.ts';

Deno.test('should return "supabase-worker"', () => {
  assertEquals(supabaseWorker(), 'supabase-worker');
});
