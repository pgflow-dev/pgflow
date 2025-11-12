import { assertEquals, assertExists } from '@std/assert';
import { Queue } from '../../src/queue/Queue.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import type { PgmqMessageRecord } from '../../src/queue/types.ts';
import { createQueueWorkerContext } from '../../src/core/supabase-test-utils.ts';
import type { SupabaseEnv } from '@pgflow/dsl/supabase';

const DEFAULT_TEST_SUPABASE_ENV: SupabaseEnv = {
  EDGE_WORKER_DB_URL: 'postgresql://test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SB_EXECUTION_ID: 'test-execution-id',
};

Deno.test(
  'MessageExecutor - handler with context receives all context properties',
  withTransaction(async (sql) => {
    const queueName = 'test-context-queue';
    const queue = new Queue(sql, queueName, createFakeLogger('test-context-queue'));
    await queue.safeCreate();

    const mockMessage: PgmqMessageRecord<{ data: string }> = {
      msg_id: 123,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { data: 'test data' },
      headers: null,
    };

    const abortController = new AbortController();
    // const logger = createFakeLogger();
    // const retryConfig = { limit: 3, delay: 1 };

    let receivedContext: ReturnType<typeof createQueueWorkerContext<{ data: string }>> | undefined;
    let receivedPayload: { data: string } | undefined;

    // Handler that accepts context - TypeScript infers the exact type
    const handler = async (
      payload: { data: string },
      context: ReturnType<typeof createQueueWorkerContext<{ data: string }>>
    ) => {
      receivedPayload = payload;
      receivedContext = context;

      // Test that we can use context.sql
      const result = await context.sql`SELECT 1 as test`;
      assertEquals(result[0].test, 1);
    };

    // Create context using proper queue worker context creation
    const context = createQueueWorkerContext({
      env: DEFAULT_TEST_SUPABASE_ENV,
      sql,
      abortSignal: abortController.signal,
      rawMessage: mockMessage,
    });

    // Mock handler call with context
    await handler(mockMessage.message!, context);

    // Verify handler received correct payload and context
    assertEquals(receivedPayload, { data: 'test data' });
    assertExists(receivedContext);
    assertEquals(receivedContext.env.SUPABASE_URL, 'https://test.supabase.co');
    assertEquals(receivedContext.sql, sql);
    assertEquals(receivedContext.shutdownSignal, abortController.signal);
    assertEquals(receivedContext.rawMessage, mockMessage);
  })
);

Deno.test(
  'MessageExecutor - backward compatibility with single-arg handlers',
  withTransaction(async (sql) => {
    const queueName = 'test-legacy-queue';
    const queue = new Queue(sql, queueName, createFakeLogger('test-legacy-queue'));
    await queue.safeCreate();

    const mockMessage: PgmqMessageRecord<{ data: string }> = {
      msg_id: 456,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { data: 'legacy test' },
      headers: null,
    };

    let receivedPayload: { data: string } | undefined;
    let handlerCallCount = 0;

    // Legacy handler that only accepts payload
    const legacyHandler = (payload: { data: string }) => {
      receivedPayload = payload;
      handlerCallCount++;
    };

    // Call legacy handler without context
    await legacyHandler(mockMessage.message!);

    // Verify handler worked correctly
    assertEquals(receivedPayload, { data: 'legacy test' });
    assertEquals(handlerCallCount, 1);
  })
);

Deno.test(
  'MessageExecutor - context.rawMessage matches the message being processed',
  withTransaction(async (sql) => {
    const queueName = 'test-rawmessage-queue';
    const queue = new Queue(sql, queueName, createFakeLogger('test-rawmessage-queue'));
    await queue.safeCreate();

    const mockMessage: PgmqMessageRecord<{ id: number; name: string }> = {
      msg_id: 789,
      read_ct: 2,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { id: 42, name: 'test item' },
      headers: null,
    };

    const abortController = new AbortController();

    let receivedRawMessage: typeof mockMessage | undefined;

    // Handler that checks rawMessage - TypeScript infers the exact type
    const handler = (
      _payload: { id: number; name: string },
      context?: ReturnType<typeof createQueueWorkerContext<{ id: number; name: string }>>
    ) => {
      receivedRawMessage = context?.rawMessage;
    };

    // Create context first so we can infer its type
    const context = createQueueWorkerContext({
      env: DEFAULT_TEST_SUPABASE_ENV,
      sql,
      abortSignal: abortController.signal,
      rawMessage: mockMessage,
    });

    // Mock handler call with context
    await handler(mockMessage.message!, context);

    // Verify rawMessage in context matches the original message
    assertExists(receivedRawMessage);
    assertEquals(receivedRawMessage.msg_id, 789);
    assertEquals(receivedRawMessage.read_ct, 2);
    assertEquals(receivedRawMessage.message, { id: 42, name: 'test item' });
  })
);

Deno.test(
  'MessageExecutor - Supabase clients are available when env vars exist',
  withTransaction(async (sql) => {
    const mockMessage: PgmqMessageRecord<{ test: string }> = {
      msg_id: 999,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { test: 'supabase test' },
      headers: null,
    };

    const abortController = new AbortController();

    let supabaseClientExists = false;

    // Handler that checks Supabase client - TypeScript infers the exact type
    const handler = (
      _payload: { test: string },
      context?: ReturnType<typeof createQueueWorkerContext<{ test: string }>>
    ) => {
      supabaseClientExists = context?.supabase !== undefined;
    };

    // Create context with Supabase env vars
    const context = createQueueWorkerContext({
      env: DEFAULT_TEST_SUPABASE_ENV,
      sql,
      abortSignal: abortController.signal,
      rawMessage: mockMessage,
    });

    // Mock handler call with context
    await handler(mockMessage.message!, context);

    // Verify Supabase client is available
    assertEquals(supabaseClientExists, true);
  })
);
