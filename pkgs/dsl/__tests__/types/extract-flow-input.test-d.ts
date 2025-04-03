import { AnyFlow, ExtractFlowInput, Flow } from '../../src/index.ts';
import { describe, it, expectTypeOf } from 'vitest';

describe('ExtractFlowInput utility type', () => {
  it('should correctly extract the input type from a flow with defined input', () => {
    const flow = new Flow<{ userId: number; query: string }>({
      slug: 'user_search_flow',
    });

    type FlowInput = ExtractFlowInput<typeof flow>;

    expectTypeOf<FlowInput>().toMatchTypeOf<{
      userId: number;
      query: string;
    }>();

    // ensure it doesn't extract non-existent fields
    expectTypeOf<FlowInput>().not.toMatchTypeOf<{
      nonExistentField: number;
    }>();
  });

  it('should work with AnyFlow', () => {
    const anyFlow: AnyFlow = new Flow<{ data: string }>({ slug: 'any_flow' });

    type ExtractedInput = ExtractFlowInput<typeof anyFlow>;

    expectTypeOf<ExtractedInput>().toMatchTypeOf<any>();
  });

  it('should extract complex nested input types', () => {
    const complexFlow = new Flow<{
      user: {
        id: number;
        profile: {
          name: string;
          preferences: string[];
        };
      };
      options: {
        includeMeta: boolean;
      };
    }>({ slug: 'complex_input_flow' });

    type ComplexInput = ExtractFlowInput<typeof complexFlow>;

    expectTypeOf<ComplexInput>().toMatchTypeOf<{
      user: {
        id: number;
        profile: {
          name: string;
          preferences: string[];
        };
      };
      options: {
        includeMeta: boolean;
      };
    }>();

    // ensure it doesn't extract non-existent fields
    expectTypeOf<ComplexInput>().not.toMatchTypeOf<{
      user: {
        nonExistentField: number;
      };
      options: {
        nonExistentOption: string;
      };
      nonExistentInput: string;
    }>();
  });
});
