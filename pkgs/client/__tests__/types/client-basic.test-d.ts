import { createClient } from '@supabase/supabase-js';
import { PgflowClient } from '../../src/lib/PgflowClient';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types';
import {
  Flow,
  type AnyFlow,
  type ExtractFlowInput,
  type ExtractFlowOutput,
} from '@pgflow/dsl';

// Create a sample flow for testing
const AnalyzeWebsite = new Flow<{ url: string }>({
  slug: 'analyze_website',
  maxAttempts: 3,
  baseDelay: 5,
  timeout: 10,
})
  .step({ slug: 'website' }, (input) => ({
    content: `Content for ${input.run.url}`,
  }))
  .step({ slug: 'sentiment', dependsOn: ['website'] }, (input) => ({
    score: 0.75,
  }))
  .step({ slug: 'summary', dependsOn: ['website'] }, (input) => ({
    aiSummary: `Summary of ${input.website.content}`,
  }))
  .step({ slug: 'saveToDb', dependsOn: ['sentiment', 'summary'] }, (input) => ({
    status: 'success',
  }));
import { describe, it, expectTypeOf } from 'vitest';

describe('PgflowClient Type Tests', () => {
  // Mock Supabase client
  const supabase = createClient(
    'https://example.supabase.co',
    'your-supabase-key'
  );

  it('should properly type client instantiation', () => {
    const client = new PgflowClient(supabase);
    expectTypeOf(client).toBeObject();
    expectTypeOf(client.startFlow).toBeFunction();
    expectTypeOf(client.getRun).toBeFunction();
    expectTypeOf(client.disposeAll).toBeFunction();
  });

  it('should properly type startFlow method with correct input types', () => {
    const client = new PgflowClient(supabase);

    type ExpectedInput = ExtractFlowInput<typeof AnalyzeWebsite>;
    expectTypeOf<ExpectedInput>().toMatchTypeOf<{ url: string }>();

    const startFlow = client.startFlow(AnalyzeWebsite.slug, {
      url: 'https://example.com',
    });

    // Correctly enforces input type
    client.startFlow<typeof AnalyzeWebsite>(AnalyzeWebsite.slug, {
      // @ts-expect-error - should enforce correct input shape
      wrongProp: 'value',
    });

    // Return type should be Promise<FlowRun<typeof AnalyzeWebsite>>
    expectTypeOf(startFlow).resolves.toHaveProperty('run_id');
    expectTypeOf(startFlow).resolves.toHaveProperty('status');
    expectTypeOf(startFlow).resolves.toHaveProperty('input');
    expectTypeOf(startFlow).resolves.toHaveProperty('waitForStatus');
  });

  it('should properly type waitForStatus method', async () => {
    const client = new PgflowClient(supabase);
    const run = await client.startFlow<typeof AnalyzeWebsite>(
      AnalyzeWebsite.slug,
      {
        url: 'https://example.com',
      }
    );

    const waitResult = run.waitForStatus(FlowRunStatus.Completed, {
      timeoutMs: 5000,
    });

    // Wait should return the run with proper typing
    expectTypeOf(waitResult).resolves.toHaveProperty('output');

    // Output should match flow's output type
    type ExpectedOutput = ExtractFlowOutput<typeof AnalyzeWebsite>;
    expectTypeOf(waitResult)
      .resolves.toHaveProperty('output')
      .toEqualTypeOf<ExpectedOutput | null>();
  });

  it('should properly type step method and step operations', async () => {
    const client = new PgflowClient(supabase);
    const run = await client.startFlow(AnalyzeWebsite.slug, {
      url: 'https://example.com',
    });

    // Step access with correct slug
    const sentimentStep = run.step('sentiment');
    expectTypeOf(sentimentStep).toHaveProperty('status');
    expectTypeOf(sentimentStep).toHaveProperty('output');
    expectTypeOf(sentimentStep).toHaveProperty('waitForStatus');

    // Correctly types step output based on the flow definition
    expectTypeOf(sentimentStep.output).toEqualTypeOf<{
      score: number;
    } | null>();

    // Step event handlers should have correct typings
    sentimentStep.on('completed', (event) => {
      expectTypeOf(event).toHaveProperty('output');
      expectTypeOf(event.output).toMatchTypeOf<{ score: number }>();
      expectTypeOf(event.status).toEqualTypeOf(FlowStepStatus.Completed);
    });

    // Wait for step should return the step with proper typing
    const stepWaitResult = sentimentStep.waitForStatus(
      FlowStepStatus.Completed
    );
    expectTypeOf(stepWaitResult).resolves.toHaveProperty('output');
    expectTypeOf(stepWaitResult)
      .resolves.toHaveProperty('output')
      .toEqualTypeOf<{ score: number } | null>();
  });

  it('should properly type getRun method', () => {
    const client = new PgflowClient(supabase);

    const runPromise = client.getRun<typeof AnalyzeWebsite>('some-run-id');

    // getRun should return a promise that resolves to FlowRun or null
    expectTypeOf(runPromise).resolves.toEqualTypeOf<ReturnType<
      typeof client.startFlow<typeof AnalyzeWebsite>
    > | null>();

    expectTypeOf(runPromise).resolves.toMatchTypeOf<{
      run_id: string;
      step: (stepSlug: string) => any;
      waitForStatus: Function;
      status: FlowRunStatus;
    } | null>();
  });

  it('should properly type event subscription', async () => {
    const client = new PgflowClient(supabase);
    const run = await client.startFlow(AnalyzeWebsite.slug, {
      url: 'https://example.com',
    });

    // Event handler type checking
    run.on('*', (event) => {
      expectTypeOf(event).toHaveProperty('run_id');
      expectTypeOf(event).toHaveProperty('status');
    });

    run.on('completed', (event) => {
      expectTypeOf(event).toHaveProperty('output');
      expectTypeOf(event).toHaveProperty('completed_at');
      expectTypeOf(event.status).toEqualTypeOf(FlowRunStatus.Completed);

      // Output should match flow's output type
      type ExpectedOutput = ExtractFlowOutput<typeof AnalyzeWebsite>;
      expectTypeOf(event.output).toEqualTypeOf<ExpectedOutput>();
    });

    run.on('failed', (event) => {
      expectTypeOf(event).toHaveProperty('error_message');
      expectTypeOf(event).toHaveProperty('failed_at');
      expectTypeOf(event.status).toEqualTypeOf(FlowRunStatus.Failed);
    });
  });

  it('should allow using FlowRun with generic flow type', () => {
    function processAnyFlow<TFlow extends AnyFlow>(
      client: PgflowClient,
      flowSlug: string,
      input: ExtractFlowInput<TFlow>
    ) {
      const runPromise = client.startFlow<TFlow>(flowSlug, input);

      expectTypeOf(runPromise).resolves.toHaveProperty('run_id');
      expectTypeOf(runPromise).resolves.toHaveProperty('waitForStatus');

      return runPromise;
    }

    // Using with a specific flow
    const client = new PgflowClient(supabase);
    const run = processAnyFlow<typeof AnalyzeWebsite>(
      client,
      AnalyzeWebsite.slug,
      { url: 'https://example.com' }
    );

    // Should maintain the generic flow type
    expectTypeOf(run)
      .resolves.toHaveProperty('output')
      .toEqualTypeOf<ExtractFlowOutput<typeof AnalyzeWebsite> | null>();
  });
});
