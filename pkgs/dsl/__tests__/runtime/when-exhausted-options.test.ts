import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { compileFlow } from '../../src/compile-flow.js';

describe('whenExhausted Options', () => {
  describe('DSL accepts whenExhausted option', () => {
    it('should accept whenExhausted option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', whenExhausted: 'skip' },
        () => 'result'
      );

      const step = flow.getStepDefinition('step1');
      expect(step.options.whenExhausted).toBe('skip');
    });

    it('should accept whenExhausted: fail (default behavior)', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', whenExhausted: 'fail' },
        () => 'result'
      );

      const step = flow.getStepDefinition('step1');
      expect(step.options.whenExhausted).toBe('fail');
    });

    it('should accept whenExhausted: skip-cascade', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', whenExhausted: 'skip-cascade' },
        () => 'result'
      );

      const step = flow.getStepDefinition('step1');
      expect(step.options.whenExhausted).toBe('skip-cascade');
    });

    it('should accept whenExhausted on dependent steps', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => ({ data: 'test' }))
        .step(
          {
            slug: 'second',
            dependsOn: ['first'],
            whenExhausted: 'skip',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('second');
      expect(step.options.whenExhausted).toBe('skip');
    });

    it('should accept whenExhausted together with other options', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        {
          slug: 'step1',
          maxAttempts: 3,
          timeout: 60,
          whenExhausted: 'skip-cascade',
        },
        () => 'result'
      );

      const step = flow.getStepDefinition('step1');
      expect(step.options.maxAttempts).toBe(3);
      expect(step.options.timeout).toBe(60);
      expect(step.options.whenExhausted).toBe('skip-cascade');
    });

    it('should accept both whenUnmet and whenExhausted together', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        {
          slug: 'step1',
          if: { enabled: true },
          whenUnmet: 'skip',
          whenExhausted: 'skip-cascade',
        },
        () => 'result'
      );

      const step = flow.getStepDefinition('step1');
      expect(step.options.if).toEqual({ enabled: true });
      expect(step.options.whenUnmet).toBe('skip');
      expect(step.options.whenExhausted).toBe('skip-cascade');
    });
  });

  describe('compileFlow includes when_exhausted parameter', () => {
    it('should compile when_exhausted for step', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', whenExhausted: 'skip' },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_exhausted => 'skip'");
    });

    it('should compile when_exhausted: fail', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', whenExhausted: 'fail' },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_exhausted => 'fail'");
    });

    it('should compile when_exhausted: skip-cascade', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', whenExhausted: 'skip-cascade' },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_exhausted => 'skip-cascade'");
    });

    it('should compile step with all options including whenExhausted', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        {
          slug: 'step1',
          maxAttempts: 3,
          timeout: 60,
          if: { enabled: true },
          whenUnmet: 'skip',
          whenExhausted: 'skip-cascade',
        },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain('max_attempts => 3');
      expect(statements[1]).toContain('timeout => 60');
      expect(statements[1]).toContain(
        'required_input_pattern => \'{"enabled":true}\''
      );
      expect(statements[1]).toContain("when_unmet => 'skip'");
      expect(statements[1]).toContain("when_exhausted => 'skip-cascade'");
    });

    it('should not include when_exhausted when not specified', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1' },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).not.toContain('when_exhausted');
    });
  });

  describe('whenExhausted on map steps', () => {
    it('should accept whenExhausted on map step', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' }).map(
        { slug: 'map_step', whenExhausted: 'skip' },
        (item) => item.toUpperCase()
      );

      const step = flow.getStepDefinition('map_step');
      expect(step.options.whenExhausted).toBe('skip');
    });

    it('should compile when_exhausted for map step', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' }).map(
        { slug: 'map_step', whenExhausted: 'skip-cascade' },
        (item) => item.toUpperCase()
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_exhausted => 'skip-cascade'");
    });
  });
});
