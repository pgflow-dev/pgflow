import { it, expectTypeOf } from 'vitest';
import { AnalyzeWebsite } from '../../src/example-flow.js';

const websiteStepDef = AnalyzeWebsite.getStepDefinition('website');
const sentimentStepDef = AnalyzeWebsite.getStepDefinition('sentiment');
const summaryStepDef = AnalyzeWebsite.getStepDefinition('summary');
const saveToDbStepDef = AnalyzeWebsite.getStepDefinition('saveToDb');

const flowInput = { url: 'https://example.com' };
const website = { content: 'holahola' };
const summary = { aiSummary: 'holahola' };
const sentiment = { score: 0.5 };

it('should correctly handle AnalyzeWebsite flow steps with proper types', () => {
  // Test website step handler type - root step receives flowInput directly (no run key)
  expectTypeOf(websiteStepDef.handler).toBeFunction();
  expectTypeOf(websiteStepDef.handler).parameters.toMatchTypeOf<
    [{ url: string }, any]
  >();
  expectTypeOf(websiteStepDef.handler).returns.toMatchTypeOf<
    Promise<{ content: string }> | { content: string }
  >();

  // Test sentiment step handler type - dependent step receives deps only (no run key)
  expectTypeOf(sentimentStepDef.handler).toBeFunction();
  expectTypeOf(sentimentStepDef.handler).parameters.toMatchTypeOf<
    [{ website: { content: string } }, any]
  >();
  expectTypeOf(sentimentStepDef.handler).returns.toMatchTypeOf<
    Promise<{ score: number }> | { score: number }
  >();

  // Test summary step handler type - dependent step receives deps only
  expectTypeOf(summaryStepDef.handler).toBeFunction();
  expectTypeOf(summaryStepDef.handler).parameters.toMatchTypeOf<
    [{ website: { content: string } }, any]
  >();
  expectTypeOf(summaryStepDef.handler).returns.toMatchTypeOf<
    Promise<{ aiSummary: string }> | { aiSummary: string }
  >();

  // Test saveToDb step handler type - dependent step receives deps only
  expectTypeOf(saveToDbStepDef.handler).toBeFunction();
  expectTypeOf(saveToDbStepDef.handler).parameters.toMatchTypeOf<
    [
      {
        sentiment: { score: number };
        summary: { aiSummary: string };
      },
      any
    ]
  >();
  expectTypeOf(saveToDbStepDef.handler).returns.toMatchTypeOf<
    Promise<string> | string
  >();
});

it('allows to call handlers with matching inputs and context', () => {
  // Handlers now require context parameter (FlowContext)
  // Root step: receives flowInput directly
  const mockContext = {} as any;
  websiteStepDef.handler(flowInput, mockContext);
  // Dependent steps: receive deps only (no run key)
  sentimentStepDef.handler({ website }, mockContext);
  summaryStepDef.handler({ website }, mockContext);
  saveToDbStepDef.handler({ summary, sentiment }, mockContext);
});
it('does not allow to call with additional keys', () => {
  const mockContext = {} as any;

  // @ts-expect-error - no additional keys allowed
  websiteStepDef.handler({ ...flowInput, newKey: true }, mockContext);

  // @ts-expect-error - no additional keys allowed
  sentimentStepDef.handler({ website, newKey: true }, mockContext);

  // @ts-expect-error - no additional keys allowed
  summaryStepDef.handler({ website, newKey: true }, mockContext);

  // @ts-expect-error - no additional keys allowed
  saveToDbStepDef.handler({ summary, sentiment, newKey: true }, mockContext);
});
