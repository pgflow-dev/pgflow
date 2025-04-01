import { it, expectTypeOf } from 'vitest';
import { AnalyzeWebsite } from '../../src/example-flow.ts';

const websiteStepDef = AnalyzeWebsite.getStepDefinition('website');
const sentimentStepDef = AnalyzeWebsite.getStepDefinition('sentiment');
const summaryStepDef = AnalyzeWebsite.getStepDefinition('summary');
const saveToDbStepDef = AnalyzeWebsite.getStepDefinition('saveToDb');

const run = { url: 'https://example.com' };
const website = { content: 'holahola' };
const summary = { aiSummary: 'holahola' };
const sentiment = { score: 0.5 };

it('should correctly handle AnalyzeWebsite flow steps with proper types', () => {
  // Test website step handler type
  expectTypeOf(websiteStepDef.handler).toBeFunction();
  expectTypeOf(websiteStepDef.handler).parameters.toMatchTypeOf<
    [{ run: { url: string } }]
  >();
  expectTypeOf(websiteStepDef.handler).returns.toMatchTypeOf<
    Promise<{ content: string }> | { content: string }
  >();

  // Test sentiment step handler type
  expectTypeOf(sentimentStepDef.handler).toBeFunction();
  expectTypeOf(sentimentStepDef.handler).parameters.toMatchTypeOf<
    [{ run: { url: string }; website: { content: string } }]
  >();
  expectTypeOf(sentimentStepDef.handler).returns.toMatchTypeOf<
    Promise<{ score: number }> | { score: number }
  >();

  // Test summary step handler type
  expectTypeOf(summaryStepDef.handler).toBeFunction();
  expectTypeOf(summaryStepDef.handler).parameters.toMatchTypeOf<
    [{ run: { url: string }; website: { content: string } }]
  >();
  expectTypeOf(summaryStepDef.handler).returns.toMatchTypeOf<
    Promise<{ aiSummary: string }> | { aiSummary: string }
  >();

  // Test saveToDb step handler type
  expectTypeOf(saveToDbStepDef.handler).toBeFunction();
  expectTypeOf(saveToDbStepDef.handler).parameters.toMatchTypeOf<
    [
      {
        run: { url: string };
        sentiment: { score: number };
        summary: { aiSummary: string };
      }
    ]
  >();
  expectTypeOf(saveToDbStepDef.handler).returns.toMatchTypeOf<
    Promise<string> | string
  >();
});

it('allows to call handlers with matching inputs', () => {
  websiteStepDef.handler({ run });
  sentimentStepDef.handler({ run, website });
  summaryStepDef.handler({ run, website });
  saveToDbStepDef.handler({ run, summary, sentiment });
});
it('does not allow to call with additional keys', () => {
  // @ts-expect-error - no additional keys allowed
  websiteStepDef.handler({ run, newKey: true });

  // @ts-expect-error - no additional keys allowed
  sentimentStepDef.handler({ run, website, newKey: true });

  // @ts-expect-error - no additional keys allowed
  summaryStepDef.handler({ run, website, newKey: true });

  // @ts-expect-error - no additional keys allowed
  saveToDbStepDef.handler({ run, summary, sentiment, newKey: true });
});
