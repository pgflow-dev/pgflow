import { assertEquals, assertExists } from '@std/assert';
import { 
  createSupabaseMessageContext, 
  createSupabaseStepTaskContext,
  createMockSupabaseResources
} from '../../src/test/test-helpers.ts';
import { createTestMessageContext } from '../../src/core/test-context-utils.ts';
import type { PgmqMessageRecord } from '../../src/queue/types.ts';
import type { StepTaskRecord } from '../../src/flow/types.ts';

// Mock SQL client
const mockSql = {} as unknown as import('postgres').default.Sql;

// Mock abort signal
const mockAbortSignal = new AbortController().signal;

// Mock environment variables with all Supabase keys
const fullEnv = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
};

// Mock environment variables without Supabase keys
const minimalEnv = {
  NODE_ENV: 'test',
};

// Mock pgmq message record
const mockMessage: PgmqMessageRecord<{ test: string }> = {
  msg_id: 123,
  read_ct: 1,
  enqueued_at: '2024-01-01T00:00:00Z',
  vt: '2024-01-01T00:01:00Z',
  message: { test: 'data' },
  headers: null,
};

// Mock pgmq message record with step input structure
const mockStepMessage: PgmqMessageRecord<{ run: { test: string } }> = {
  msg_id: 123,
  read_ct: 1,
  enqueued_at: '2024-01-01T00:00:00Z',
  vt: '2024-01-01T00:01:00Z',
  message: { run: { test: 'data' } },
  headers: null,
};

// Mock flow input
const mockFlowInput = { test: 'flow-input' };

// Mock step task (using generic typing)
const mockStepTask = {
  flow_slug: 'test-flow',
  run_id: 'run-456',
  step_slug: 'test-step',
  input: { run: { test: 'input' } },
  msg_id: 123,
  flow_input: mockFlowInput,  // Can be actual value or null - test helper wraps in Promise
  task_index: 0
} as unknown as StepTaskRecord<never>;

Deno.test('createSupabaseMessageContext - creates context with all Supabase resources', () => {
  const context = createSupabaseMessageContext({
    env: fullEnv,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    rawMessage: mockMessage,
  });
  
  // Check all properties exist
  assertEquals(context.env, fullEnv);
  assertEquals(context.sql, mockSql);
  assertEquals(context.shutdownSignal, mockAbortSignal);
  assertEquals(context.rawMessage, mockMessage);
  
  // Supabase client should always be present
  assertExists(context.supabase);
});

Deno.test('createTestMessageContext - allows custom resources for testing', () => {
  const customResources = {
    sql: mockSql,
    customResource: 'test-value'
  };

  const context = createTestMessageContext({
    env: minimalEnv,
    abortSignal: mockAbortSignal,
    rawMessage: mockMessage,
    ...customResources
  });
  
  // Check core properties
  assertEquals(context.env, minimalEnv);
  assertEquals(context.shutdownSignal, mockAbortSignal);
  assertEquals(context.rawMessage, mockMessage);
  
  // Check custom resources
  assertEquals(context.sql, mockSql);
  assertEquals((context as unknown as { customResource: string }).customResource, 'test-value');
});

Deno.test('createSupabaseStepTaskContext - creates context with step task', async () => {
  const context = createSupabaseStepTaskContext({
    env: fullEnv,
    sql: mockSql,
    abortSignal: mockAbortSignal,
    stepTask: mockStepTask,
    rawMessage: mockStepMessage,
    flowInput: mockFlowInput,
  });

  // Check all properties exist
  assertEquals(context.env, fullEnv);
  assertEquals(context.sql, mockSql);
  assertEquals(context.shutdownSignal, mockAbortSignal);
  assertEquals(context.stepTask, mockStepTask);
  assertEquals(context.rawMessage, mockStepMessage);

  // flowInput is now a Promise
  assertEquals(await context.flowInput, mockFlowInput);

  // Supabase client should always be present
  assertExists(context.supabase);
});

Deno.test('context - rawMessage is accessible', () => {
  const context = createTestMessageContext({
    env: minimalEnv,
    abortSignal: mockAbortSignal,
    rawMessage: mockMessage,
    sql: mockSql
  });
  
  assertEquals(context.rawMessage.msg_id, 123);
  assertEquals(context.rawMessage.message, { test: 'data' });
});

Deno.test('test helpers - mock resources work correctly', () => {
  const mockResources = createMockSupabaseResources({
    sql: mockSql
  });
  
  assertExists(mockResources.sql);
  assertExists(mockResources.supabase);
  
  // Mock client should have basic structure
  assertExists(mockResources.supabase.from);
});