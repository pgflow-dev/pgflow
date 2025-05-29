import { createClient } from '@supabase/supabase-js';
import { PgflowClient } from '../src/lib/PgflowClient';
import { FlowRunStatus, FlowStepStatus } from '../src/lib/types';
import {
  Flow,
  type AnyFlow,
  type ExtractFlowInput,
  type ExtractFlowOutput,
  type ExtractFlowSteps,
  type StepInput,
  type StepOutput,
  type Simplify,
} from '@pgflow/dsl';
import { describe, it, expectTypeOf } from 'vitest';

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

describe('PgflowClient Type Tests', () => {
  // Mock Supabase client
  const supabase = createClient(
    'https://example.supabase.co',
    'your-supabase-key'
  );

  it('should properly type startFlow method with correct input types', () => {
    const client = new PgflowClient(supabase);

    // Extract the input type from the flow
    type FlowInput = ExtractFlowInput<typeof AnalyzeWebsite>;
    expectTypeOf<FlowInput>().toEqualTypeOf<{ url: string }>();

    // Create a simplified input that matches the flow's expected input
    type SimpleInput = Simplify<FlowInput>;
    expectTypeOf<SimpleInput>().toEqualTypeOf<{ url: string }>();

    // Test with correct input typing
    const startFlow = client.startFlow<typeof AnalyzeWebsite>(
      AnalyzeWebsite.slug,
      {
        url: 'https://example.com',
      }
    );

    // Correctly enforces input type with compile-time error for invalid inputs
    client.startFlow<typeof AnalyzeWebsite>(AnalyzeWebsite.slug, {
      // @ts-expect-error - should enforce correct input shape
      wrongProp: 'value',
    });

    // Ensures required properties are provided
    // @ts-expect-error - should require url property
    client.startFlow<typeof AnalyzeWebsite>(AnalyzeWebsite.slug, {});

    // Return type should be Promise<FlowRun<typeof AnalyzeWebsite>>
    expectTypeOf(startFlow).resolves.toHaveProperty('run_id');
    expectTypeOf(startFlow).resolves.toHaveProperty('status');
    expectTypeOf(startFlow).resolves.toHaveProperty('input');
    expectTypeOf(startFlow).resolves.toHaveProperty('waitForStatus');

    // Verify the input type is properly preserved
    expectTypeOf(startFlow)
      .resolves.toHaveProperty('input')
      .toEqualTypeOf<FlowInput>();
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

    // Output should match flow's output type using the utility type
    type FlowOutput = ExtractFlowOutput<typeof AnalyzeWebsite>;

    // We can also verify that the output structure matches what we expect
    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      saveToDb: { status: string };
    }>();

    // And check that run.output has the right type
    expectTypeOf(waitResult)
      .resolves.toHaveProperty('output')
      .toEqualTypeOf<FlowOutput | null>();
  });

  it('should properly type step method and step operations', async () => {
    const client = new PgflowClient(supabase);
    const run = await client.startFlow<typeof AnalyzeWebsite>(
      AnalyzeWebsite.slug,
      {
        url: 'https://example.com',
      }
    );

    // Step access with correct slug
    type StepSlugs = keyof ExtractFlowSteps<typeof AnalyzeWebsite> & string;
    const sentimentStepSlug: StepSlugs = 'sentiment';
    const sentimentStep = run.step(sentimentStepSlug);

    expectTypeOf(sentimentStep).toHaveProperty('status');
    expectTypeOf(sentimentStep).toHaveProperty('output');
    expectTypeOf(sentimentStep).toHaveProperty('waitForStatus');

    // Check step output type matches the DSL definition
    type SentimentOutput = StepOutput<typeof AnalyzeWebsite, 'sentiment'>;
    expectTypeOf<SentimentOutput>().toEqualTypeOf<{ score: number }>();
    expectTypeOf(sentimentStep.output).toEqualTypeOf<SentimentOutput | null>();

    // Step event handlers should have correct typings
    sentimentStep.on('completed', (event) => {
      expectTypeOf(event).toHaveProperty('output');
      expectTypeOf(event.output).toEqualTypeOf<SentimentOutput>();
      expectTypeOf(event.status).toEqualTypeOf<FlowStepStatus.Completed>();
    });

    // Wait for step should return the step with proper typing
    const stepWaitResult = sentimentStep.waitForStatus(
      FlowStepStatus.Completed
    );
    expectTypeOf(stepWaitResult).resolves.toHaveProperty('output');
    expectTypeOf(stepWaitResult)
      .resolves.toHaveProperty('output')
      .toEqualTypeOf<SentimentOutput | null>();

    // Check input type for a step
    type SentimentInput = StepInput<typeof AnalyzeWebsite, 'sentiment'>;
    expectTypeOf<SentimentInput>().toMatchTypeOf<{
      run: { url: string };
      website: { content: string };
    }>();
  });

  it('should properly type event subscription', async () => {
    const client = new PgflowClient(supabase);
    const run = await client.startFlow<typeof AnalyzeWebsite>(
      AnalyzeWebsite.slug,
      {
        url: 'https://example.com',
      }
    );

    // Event handler type checking
    run.on('*', (event) => {
      expectTypeOf(event).toHaveProperty('run_id');
      expectTypeOf(event).toHaveProperty('status');
    });

    run.on('completed', (event) => {
      expectTypeOf(event).toHaveProperty('output');
      expectTypeOf(event).toHaveProperty('completed_at');
      expectTypeOf(event.status).toEqualTypeOf<FlowRunStatus.Completed>();

      // Output should match flow's output type
      type FlowOutput = ExtractFlowOutput<typeof AnalyzeWebsite>;

      // Verify completed event has the expected output structure
      expectTypeOf<FlowOutput>().toHaveProperty('saveToDb');
      expectTypeOf<FlowOutput['saveToDb']>().toEqualTypeOf<{
        status: string;
      }>();

      // Check the event output has the correct type
      expectTypeOf(event.output).toEqualTypeOf<FlowOutput>();
    });

    run.on('failed', (event) => {
      expectTypeOf(event).toHaveProperty('error_message');
      expectTypeOf(event).toHaveProperty('failed_at');
      expectTypeOf(event.status).toEqualTypeOf<FlowRunStatus.Failed>();
    });
  });

  it('should allow using FlowRun with generic flow type', () => {
    // Create a generic function that can work with any flow
    function processAnyFlow<TFlow extends AnyFlow>(
      client: PgflowClient,
      flowSlug: string,
      input: ExtractFlowInput<TFlow>
    ) {
      const runPromise = client.startFlow<TFlow>(flowSlug, input);

      // Ensure we have the common properties
      expectTypeOf(runPromise).resolves.toHaveProperty('run_id');
      expectTypeOf(runPromise).resolves.toHaveProperty('waitForStatus');

      // Verify the run has a step method that works with flow's step slugs
      type FlowSteps = ExtractFlowSteps<TFlow>;
      type StepSlugs = keyof FlowSteps & string;

      // Ensure the step method accepts a valid step slug
      runPromise.then((run) => {
        // This would be checked at compile time
        const step = <S extends StepSlugs>(slug: S) => run.step(slug);
        return step;
      });

      return runPromise;
    }

    // Using with our specific test flow
    const client = new PgflowClient(supabase);

    // Extract the expected input type directly from the flow
    type WebsiteInput = ExtractFlowInput<typeof AnalyzeWebsite>;
    expectTypeOf<WebsiteInput>().toEqualTypeOf<{ url: string }>();

    // Start with properly typed input
    const run = processAnyFlow<typeof AnalyzeWebsite>(
      client,
      AnalyzeWebsite.slug,
      { url: 'https://example.com' }
    );

    // Should maintain the generic flow type
    type WebsiteOutput = ExtractFlowOutput<typeof AnalyzeWebsite>;
    expectTypeOf(run)
      .resolves.toHaveProperty('output')
      .toEqualTypeOf<WebsiteOutput | null>();

    // Verify the structure of the expected output
    expectTypeOf<WebsiteOutput>().toMatchTypeOf<{
      saveToDb: { status: string };
    }>();
  });
});
