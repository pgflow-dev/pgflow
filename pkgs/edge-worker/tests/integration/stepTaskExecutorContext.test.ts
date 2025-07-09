import { assertEquals, assertExists } from '@std/assert';
import { Flow } from '@pgflow/dsl';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import type { Context } from '../../src/core/context.ts';
import { createFlowWorkerContext } from '../../src/core/context-utils.ts';
import type { StepTaskRecord } from '../../src/flow/types.ts';

// Define a test flow
const TestFlow = new Flow({ slug: 'test-context-flow' })
  .step(
    { slug: 'step1' },
    async (input: { run: { value: number } }) => {
      return { result: input.run.value * 2 };
    }
  )
  .step(
    { slug: 'step2', dependsOn: ['step1'] },
    async (input: { run: { value: number }; step1: { result: number } }) => {
      return { final: input.step1.result + 10 };
    }
  );

Deno.test(
  'StepTaskExecutor - handler with context receives all context properties',
  withTransaction(async (sql) => {
    const abortController = new AbortController();
    
    let receivedContext: Context | undefined;
    let receivedInput: any;
    
    // Create a flow with handler that accepts context
    const ContextTestFlow = new Flow({ slug: 'context-test-flow' })
      .step(
        { slug: 'test-step' },
        async (input: { run: { data: string } }, context?: Context) => {
          receivedInput = input;
          receivedContext = context;
          
          // Test that we can use context.sql
          if (context?.sql) {
            const result = await context.sql`SELECT 2 as test`;
            assertEquals(result[0].test, 2);
          }
          
          return { processed: true };
        }
      );
    
    // Mock step task record
    const mockTask: StepTaskRecord<typeof ContextTestFlow> = {
      msg_id: 123,
      run_id: 'test-run-id',
      step_slug: 'test-step',
      input: { run: { data: 'test data' } },
    };
    
    // Create context with mock task and message
    const mockMessage: any = {
      msg_id: 123,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { run: { data: 'test data' } },
    };
    
    const context = createFlowWorkerContext({
      env: { FLOW_ENV: 'test' },
      sql,
      abortSignal: abortController.signal,
      taskWithMessage: {
        message: mockMessage,
        task: mockTask,
      },
    });
    
    // Get the step handler
    const stepDef = ContextTestFlow.getStepDefinition('test-step');
    
    // Mock handler call with context
    await stepDef.handler(mockTask.input, context);
    
    // Verify handler received correct input and context
    assertEquals(receivedInput, { run: { data: 'test data' } });
    assertExists(receivedContext);
    assertEquals(receivedContext.env.FLOW_ENV, 'test');
    assertEquals(receivedContext.sql, sql);
    assertEquals(receivedContext.shutdownSignal, abortController.signal);
    assertEquals(receivedContext.rawMessage, mockMessage); // Should be the message from taskWithMessage
  })
);

Deno.test(
  'StepTaskExecutor - backward compatibility with single-arg handlers',
  withTransaction(async (sql) => {
    let receivedInput: any;
    let handlerCallCount = 0;
    
    // Legacy flow with single-arg handler
    const LegacyFlow = new Flow({ slug: 'legacy-flow' })
      .step(
        { slug: 'legacy-step' },
        async (input: { run: { value: number } }) => {
          receivedInput = input;
          handlerCallCount++;
          return { doubled: input.run.value * 2 };
        }
      );
    
    // Mock step task record
    const mockTask: StepTaskRecord<typeof LegacyFlow> = {
      msg_id: 456,
      run_id: 'legacy-run-id',
      step_slug: 'legacy-step',
      input: { run: { value: 42 } },
    };
    
    // Get the step handler
    const stepDef = LegacyFlow.getStepDefinition('legacy-step');
    
    // Call legacy handler without context
    const result = await stepDef.handler(mockTask.input);
    
    // Verify handler worked correctly
    assertEquals(receivedInput, { run: { value: 42 } });
    assertEquals(result, { doubled: 84 });
    assertEquals(handlerCallCount, 1);
  })
);

Deno.test(
  'StepTaskExecutor - context.rawMessage is always undefined for flow workers',
  withTransaction(async (sql) => {
    const abortController = new AbortController();
    
    let rawMessageValue: any = 'not-checked';
    
    // Flow that checks rawMessage
    const RawMessageFlow = new Flow({ slug: 'rawmessage-flow' })
      .step(
        { slug: 'check-raw' },
        async (input: { run: {} }, context?: Context) => {
          rawMessageValue = context?.rawMessage;
          return { checked: true };
        }
      );
    
    // Mock step task record
    const mockTask: StepTaskRecord<typeof RawMessageFlow> = {
      msg_id: 789,
      run_id: 'raw-run-id',
      step_slug: 'check-raw',
      input: { run: {} },
    };
    
    // Create context (flow worker context has no rawMessage)
    const context = createFlowWorkerContext({
      env: {},
      sql,
      abortSignal: abortController.signal,
    });
    
    // Get the step handler
    const stepDef = RawMessageFlow.getStepDefinition('check-raw');
    
    // Mock handler call with context
    await stepDef.handler(mockTask.input, context);
    
    // Verify rawMessage is undefined
    assertEquals(rawMessageValue, undefined);
  })
);

Deno.test(
  'StepTaskExecutor - Supabase clients are available when env vars exist',
  withTransaction(async (sql) => {
    const abortController = new AbortController();
    
    let anonClientExists = false;
    let serviceClientExists = false;
    
    // Flow that checks Supabase clients
    const SupabaseFlow = new Flow({ slug: 'supabase-flow' })
      .step(
        { slug: 'check-clients' },
        async (input: { run: {} }, context?: Context) => {
          anonClientExists = context?.anonSupabase !== undefined;
          serviceClientExists = context?.serviceSupabase !== undefined;
          return { checked: true };
        }
      );
    
    // Mock step task record
    const mockTask: StepTaskRecord<typeof SupabaseFlow> = {
      msg_id: 999,
      run_id: 'supabase-run-id',
      step_slug: 'check-clients',
      input: { run: {} },
    };
    
    // Create context with Supabase env vars
    const context = createFlowWorkerContext({
      env: {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      },
      sql,
      abortSignal: abortController.signal,
    });
    
    // Get the step handler
    const stepDef = SupabaseFlow.getStepDefinition('check-clients');
    
    // Mock handler call with context
    await stepDef.handler(mockTask.input, context);
    
    // Verify Supabase clients are available
    assertEquals(anonClientExists, true);
    assertEquals(serviceClientExists, true);
  })
);

Deno.test(
  'StepTaskExecutor - context can be used with complex flows',
  withTransaction(async (sql) => {
    const abortController = new AbortController();
    
    let step1Context: Context | undefined;
    let step2Context: Context | undefined;
    
    // Complex flow with multiple steps using context
    const ComplexFlow = new Flow({ slug: 'complex-context-flow' })
      .step(
        { slug: 'fetch-data' },
        async (input: { run: { id: number } }, context?: Context) => {
          step1Context = context;
          
          // Simulate using context.sql to fetch data
          if (context?.sql) {
            const result = await context.sql`SELECT ${input.run.id} as id, 'test' as name`;
            return { data: result[0] };
          }
          
          return { data: { id: input.run.id, name: 'fallback' } };
        }
      )
      .step(
        { slug: 'process-data', dependsOn: ['fetch-data'] },
        async (
          input: { run: { id: number }; 'fetch-data': { data: { id: number; name: string } } },
          context?: Context
        ) => {
          step2Context = context;
          
          // Process with context
          const prefix = context?.env.DATA_PREFIX || 'default';
          return {
            processed: `${prefix}:${input['fetch-data'].data.name}:${input['fetch-data'].data.id}`,
          };
        }
      );
    
    // Create context
    const mockMessageForComplex: any = {
      msg_id: 456,
      read_ct: 1,
      enqueued_at: '2024-01-01T00:00:00Z',
      vt: '2024-01-01T00:01:00Z',
      message: { run: { id: 123 } },
    };
    
    const mockTaskForComplex: any = {
      msg_id: 456,
      run_id: 'complex-run',
      step_slug: 'fetch-data',
      input: { run: { id: 123 } },
    };
    
    const context = createFlowWorkerContext({
      env: { DATA_PREFIX: 'custom' },
      sql,
      abortSignal: abortController.signal,
      taskWithMessage: {
        message: mockMessageForComplex,
        task: mockTaskForComplex,
      },
    });
    
    // Test first step
    const step1Def = ComplexFlow.getStepDefinition('fetch-data');
    const step1Result = await step1Def.handler({ run: { id: 123 } }, context);
    
    // Verify first step
    assertExists(step1Context);
    assertEquals(step1Context.env.DATA_PREFIX, 'custom');
    assertEquals(step1Result.data.id, 123);
    
    // Test second step
    const step2Def = ComplexFlow.getStepDefinition('process-data');
    const step2Result = await step2Def.handler(
      { run: { id: 123 }, 'fetch-data': step1Result },
      context
    );
    
    // Verify second step
    assertExists(step2Context);
    assertEquals(step2Context.env.DATA_PREFIX, 'custom');
    assertEquals(step2Result.processed, 'custom:test:123');
  })
);