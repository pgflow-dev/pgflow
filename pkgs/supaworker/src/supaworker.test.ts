import { supabaseWorker } from './supaworker.ts';
import { assertEquals } from 'https://deno.land/std@0.172.0/testing/asserts.ts';

Deno.test('should return "supaworker"', () => {
  assertEquals(supabaseWorker(), 'supaworker');
});
