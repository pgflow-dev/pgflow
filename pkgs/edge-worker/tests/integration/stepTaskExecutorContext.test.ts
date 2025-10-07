import { assertEquals, assertExists } from '@std/assert';
import { Flow } from '@pgflow/dsl/supabase';
import type { FlowContext } from '@pgflow/dsl';
import type {
  SupabaseEnv,
  SupabasePlatformContext,
} from '@pgflow/dsl/supabase';
import { withTransaction } from '../db.ts';
// import { createFakeLogger } from '../fakes.ts';
import { createFlowWorkerContext } from '../../src/core/supabase-test-utils.ts';
import type { StepTaskRecord } from '../../src/flow/types.ts';

const DEFAULT_TEST_SUPABASE_ENV: SupabaseEnv = {
  EDGE_WORKER_DB_URL: 'postgresql://test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SB_EXECUTION_ID: 'test-execution-id',
};

// Define a test flow
const _TestFlow = new Flow<{ value: number }>({ slug: 'test_context_flow' })
  .step({ slug: 'step1' }, (input) => {
    return { result: input.run.value * 2 };
  })
  .step({ slug: 'step2', dependsOn: ['step1'] }, (input) => {
    return { final: input.step1.result + 10 };
  });

Deno.test(
  'StepTaskExecutor - handler with context receives all context properties',
  withTransaction(async (_sql) => {
    const abortController = new AbortController();

    let receivedContext: SupabasePlatformContext | undefined;
    let receivedInput: unknown;

    // Create a flow with handler that accepts context
    const ContextTestFlow = new Flow<{ data: string }>({ slug: 'context_test_flow' }).step(
      { slug: 'test_step' },
      async (input, context) => {
        receivedInput = input;
        receivedContext = context;

        // Test that we can use context.sql
        const result = await context.sql`SELECT 2 as test`;
        assertEquals(result[0].test, 2);

        return { processed: true };
      }
    );

    // Mock step task record
    const mockTask: StepTaskRecord<typeof ContextTestFlow> = {
      flow_slug: 'context_test_flow',
      msg_id: 123,
      run_id: 'test-run-id',
      step_slug: 'test_step',
      task_index: 0,
      input: { run: { data: 'test data' } },
    };

    // Create context with mock task and message using proper flow worker context creation
    const mockMessage = {
      msg_id: 123,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { run: { data: 'test data' } },
    };

    const context = createFlowWorkerContext({
      env: DEFAULT_TEST_SUPABASE_ENV,
      sql: _sql,
      abortSignal: abortController.signal,
      taskWithMessage: {
        msg_id: 123,
        message: mockMessage,
        task: mockTask,
      },
    });

    // Get the step handler
    const stepDef = ContextTestFlow.getStepDefinition('test_step');

    // Mock handler call with context
    await stepDef.handler(mockTask.input, context);

    // Verify handler received correct input and context
    assertEquals(receivedInput, { run: { data: 'test data' } });
    assertExists(receivedContext);
    assertEquals(receivedContext.sql, _sql);
    assertEquals(receivedContext.shutdownSignal, abortController.signal);
    assertExists(receivedContext.env);
    assertExists(receivedContext.supabase);
  })
);

Deno.test(
  'StepTaskExecutor - backward compatibility with single-arg handlers',
  withTransaction(async (_sql) => {
    let receivedInput: unknown;
    let handlerCallCount = 0;

    // Legacy flow with single-arg handler
    const LegacyFlow = new Flow<{ value: number }>({ slug: 'legacy_flow' }).step(
      { slug: 'legacy_step' },
      (input) => {
        receivedInput = input;
        handlerCallCount++;
        return { doubled: input.run.value * 2 };
      }
    );

    // Mock step task record
    const mockTask: StepTaskRecord<typeof LegacyFlow> = {
      flow_slug: 'legacy_flow',
      msg_id: 456,
      run_id: 'legacy_run_id',
      step_slug: 'legacy_step',
      task_index: 0,
      input: { run: { value: 42 } },
    };

    // Get the step handler
    const stepDef = LegacyFlow.getStepDefinition('legacy_step');

    // Create proper context for legacy handler test
    const mockMessage = {
      msg_id: 456,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { run: { value: 42 } },
    };

    const context = createFlowWorkerContext({
      env: DEFAULT_TEST_SUPABASE_ENV,
      sql: _sql,
      abortSignal: new AbortController().signal,
      taskWithMessage: {
        msg_id: 456,
        message: mockMessage,
        task: mockTask,
      },
    });

    const result = await stepDef.handler(mockTask.input, context);

    // Verify handler worked correctly
    assertEquals(receivedInput, { run: { value: 42 } });
    assertEquals(result, { doubled: 84 });
    assertEquals(handlerCallCount, 1);
  })
);

Deno.test(
  'StepTaskExecutor - context.rawMessage matches the message from StepTaskWithMessage',
  withTransaction(async (_sql) => {
    const abortController = new AbortController();

    let rawMessageValue: unknown = 'not-checked';

    // Flow that checks rawMessage
    const RawMessageFlow = new Flow<Record<string, never>>({ slug: 'rawmessage_flow' }).step(
      { slug: 'check_raw' },
      (_input, context) => {
        rawMessageValue = context?.rawMessage;
        return { checked: true };
      }
    );

    // Mock message
    const mockMessage = {
      msg_id: 789,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { run: {} },
    };

    // Mock step task record
    const mockTask: StepTaskRecord<typeof RawMessageFlow> = {
      flow_slug: 'rawmessage_flow',
      msg_id: 789,
      run_id: 'raw_run_id',
      step_slug: 'check_raw',
      task_index: 0,
      input: { run: {} },
    };

    // Create context - for this test we need a mock taskWithMessage
    const mockTaskWithMessage = {
      msg_id: 789,
      message: mockMessage,
      task: mockTask,
    };

    const context = createFlowWorkerContext({
      env: DEFAULT_TEST_SUPABASE_ENV,
      sql: _sql,
      abortSignal: abortController.signal,
      taskWithMessage: mockTaskWithMessage,
    });

    // Get the step handler
    const stepDef = RawMessageFlow.getStepDefinition('check_raw');

    // Mock handler call with context
    await stepDef.handler(mockTask.input, context);

    // Verify rawMessage matches the message from taskWithMessage
    assertEquals(rawMessageValue, mockMessage);
  })
);

Deno.test(
  'StepTaskExecutor - Supabase clients are available when env vars exist',
  withTransaction(async (_sql) => {
    const abortController = new AbortController();

    let supabaseClientExists = false;

    // Flow that checks Supabase client
    const SupabaseFlow = new Flow<Record<string, never>>({ slug: 'supabase_flow' }).step(
      { slug: 'check_clients' },
      (_input, context) => {
        supabaseClientExists = context?.supabase !== undefined;
        return { checked: true };
      }
    );

    // Mock message
    const mockMessage = {
      msg_id: 999,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { run: {} },
    };

    // Mock step task record
    const mockTask: StepTaskRecord<typeof SupabaseFlow> = {
      flow_slug: 'supabase_flow',
      msg_id: 999,
      run_id: 'supabase_run_id',
      step_slug: 'check_clients',
      task_index: 0,
      input: { run: {} },
    };

    // Create context with Supabase env vars
    const mockTaskWithMessage = {
      msg_id: 999,
      message: mockMessage,
      task: mockTask,
    };

    const context = createFlowWorkerContext({
      env: DEFAULT_TEST_SUPABASE_ENV,
      sql: _sql,
      abortSignal: abortController.signal,
      taskWithMessage: mockTaskWithMessage,
    });

    // Get the step handler
    const stepDef = SupabaseFlow.getStepDefinition('check_clients');

    // Mock handler call with context
    await stepDef.handler(mockTask.input, context);

    // Verify Supabase clients are available
    assertEquals(supabaseClientExists, true);
  })
);

Deno.test(
  'StepTaskExecutor - context can be used with complex flows',
  withTransaction(async (_sql) => {
    const abortController = new AbortController();

    let step1Context: (FlowContext<SupabaseEnv> & SupabasePlatformContext) | undefined;
    let step2Context: (FlowContext<SupabaseEnv> & SupabasePlatformContext) | undefined;

    // Complex flow with multiple steps using context
    const ComplexFlow = new Flow<{ id: number }>({ slug: 'complex_context_flow' })
      .step(
        { slug: 'fetch_data' },
        async (input, context) => {
          step1Context = context;

          // Simulate using context.sql to fetch data
          if (context?.sql) {
            const result =
              await context.sql`SELECT ${input.run.id}::integer as id, 'test' as name`;
            return { data: result[0] };
          }

          return { data: { id: input.run.id, name: 'fallback' } };
        }
      )
      .step(
        { slug: 'process_data', dependsOn: ['fetch_data'] },
        (input, context) => {
          step2Context = context;

          // Process with context
          const prefix = context?.env.DATA_PREFIX || 'default';
          return {
            processed: `${prefix}:${input['fetch_data'].data.name}:${input['fetch_data'].data.id}`,
          };
        }
      );

    // Create context
    const mockMessageForComplex = {
      msg_id: 456,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { run: { id: 123 } },
    };

    const mockTaskForComplex: StepTaskRecord<typeof ComplexFlow> = {
      flow_slug: 'complex_context_flow',
      msg_id: 456,
      run_id: 'complex_run',
      step_slug: 'fetch_data',
      task_index: 0,
      input: { run: { id: 123 } },
    };

    const context = createFlowWorkerContext({
      env: { ...DEFAULT_TEST_SUPABASE_ENV, DATA_PREFIX: 'custom' },
      sql: _sql,
      abortSignal: abortController.signal,
      taskWithMessage: {
        msg_id: 456,
        message: mockMessageForComplex,
        task: mockTaskForComplex,
      },
    });

    // Test first step
    const step1Def = ComplexFlow.getStepDefinition('fetch_data');
    const step1Result = await step1Def.handler({ run: { id: 123 } }, context);

    // Verify first step
    assertExists(step1Context);
    assertEquals(step1Context.env.DATA_PREFIX, 'custom');
    assertEquals((step1Result as { data: { id: number } }).data.id, 123);

    // Test second step
    const step2Def = ComplexFlow.getStepDefinition('process_data');
    const step2Result = await step2Def.handler(
      { run: { id: 123 }, 'fetch_data': step1Result },
      context
    );

    // Verify second step
    assertExists(step2Context);
    assertEquals(step2Context.env.DATA_PREFIX, 'custom');
    assertEquals((step2Result as { processed: string }).processed, 'custom:test:123');
  })
);
