import { assertEquals, assertExists } from '@std/assert';
import { createQueueWorkerContext, createFlowWorkerContext } from '../../src/core/context-utils.ts';
import type { PgmqMessageRecord } from '../../src/queue/types.ts';

// Mock SQL client
const mockSql = {} as any;

// Mock abort signal
const mockAbortSignal = new AbortController().signal;

// Mock environment variables
const mockEnv = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
};

// Mock pgmq message record for queue worker (simple payload)
const mockMessage: PgmqMessageRecord<{ test: string }> = {
  msg_id: 123,
  read_ct: 1,
  enqueued_at: '2024-01-01T00:00:00Z',
  vt: '2024-01-01T00:01:00Z',
  message: { test: 'data' },
};

// Mock pgmq message record for flow worker (must have run property)
const mockFlowMessage: any = {
  msg_id: 456,
  read_ct: 1,
  enqueued_at: '2024-01-01T00:00:00Z',
  vt: '2024-01-01T00:01:00Z',
  message: { run: { test: 'data' } },
};

Deno.test('createQueueWorkerContext - creates context with all properties', () => {
  const context = createQueueWorkerContext({
    env: mockEnv,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    rawMessage: mockMessage,
  });
  
  // Check all properties exist
  assertEquals(context.env, mockEnv);
  assertEquals(context.sql, mockSql);
  assertEquals(context.shutdownSignal, mockAbortSignal);
  assertEquals(context.rawMessage, mockMessage);
  
  // Supabase clients should be accessible (lazy loaded)
  assertExists(context.anonSupabase);
  assertEquals(context.serviceSupabase, undefined); // No service key in env
});

Deno.test('createQueueWorkerContext - rawMessage is defined', () => {
  const context = createQueueWorkerContext({
    env: mockEnv,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    rawMessage: mockMessage,
  });
  
  assertExists(context.rawMessage);
  assertEquals(context.rawMessage?.msg_id, 123);
  assertEquals(context.rawMessage?.message, { test: 'data' });
});

Deno.test('createFlowWorkerContext - creates context with taskWithMessage', () => {
  const mockTask: any = {
    msg_id: 456,
    run_id: 'test-run',
    step_slug: 'test-step',
    flow_slug: 'test-flow',
    input: { test: 'data' },
  };
  
  const context = createFlowWorkerContext({
    env: mockEnv,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    taskWithMessage: {
      message: mockFlowMessage,
      task: mockTask,
    },
  });
  
  // Check all properties exist
  assertEquals(context.env, mockEnv);
  assertEquals(context.sql, mockSql);
  assertEquals(context.shutdownSignal, mockAbortSignal);
  assertEquals(context.rawMessage, mockFlowMessage); // Should be the message from taskWithMessage
  assertEquals(context.stepTask, mockTask); // Should have the step task
  
  // Supabase clients should be accessible (lazy loaded)
  assertExists(context.anonSupabase);
  assertEquals(context.serviceSupabase, undefined); // No service key in env
});

Deno.test('createFlowWorkerContext - rawMessage comes from taskWithMessage', () => {
  const mockTask: any = {
    msg_id: 789,
    run_id: 'test-run-2',
    step_slug: 'test-step-2',
    flow_slug: 'test-flow-2',
    input: { test: 'different data' },
  };
  
  const context = createFlowWorkerContext({
    env: mockEnv,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    taskWithMessage: {
      message: mockFlowMessage,
      task: mockTask,
    },
  });
  
  assertEquals(context.rawMessage, mockFlowMessage);
  assertEquals(context.stepTask, mockTask);
});

Deno.test('context utils - Supabase clients are memoized', () => {
  const context = createQueueWorkerContext({
    env: mockEnv,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    rawMessage: mockMessage,
  });
  
  // Access anonSupabase multiple times
  const client1 = context.anonSupabase;
  const client2 = context.anonSupabase;
  const client3 = context.anonSupabase;
  
  // Should be the same instance
  assertEquals(client1, client2);
  assertEquals(client2, client3);
});

Deno.test('context utils - Supabase clients are undefined when env vars missing', () => {
  const envWithoutSupabase = {
    NODE_ENV: 'test',
  };
  
  const context = createQueueWorkerContext({
    env: envWithoutSupabase,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    rawMessage: mockMessage,
  });
  
  assertEquals(context.anonSupabase, undefined);
  assertEquals(context.serviceSupabase, undefined);
});

Deno.test('context utils - both Supabase clients available with all env vars', () => {
  const envWithBothKeys = {
    ...mockEnv,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };
  
  const context = createQueueWorkerContext({
    env: envWithBothKeys,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    rawMessage: mockMessage,
  });
  
  assertExists(context.anonSupabase);
  assertExists(context.serviceSupabase);
  // They should be different instances
  assertEquals(context.anonSupabase === context.serviceSupabase, false);
});