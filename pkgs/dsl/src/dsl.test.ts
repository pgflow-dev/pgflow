import { Flow } from './dsl.ts';
import { describe, it, expect } from 'vitest';

describe('getSteps()', () => {
  it('returns empty object if no steps are added', () => {
    const flow = new Flow({ slug: 'test_flow' });

    expect(flow.getSteps()).toEqual([]);
  });

  it('returns object with steps if steps were added', () => {
    const handler1 = async () => 23;
    const handler2 = async () => 24;
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1' }, handler1)
      .step({ slug: 'step2', dependsOn: ['step1'] }, handler2);

    expect(flow.getSteps()).toEqual([
      { slug: 'step1', handler: handler1, dependencies: [] },
      { slug: 'step2', handler: handler2, dependencies: ['step1'] },
    ]);
  });
});
