import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { compileFlow } from '../../src/compile-flow.js';

describe('whenFailed Options', () => {
  describe('DSL accepts whenFailed option', () => {
    it('should accept whenFailed option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', whenFailed: 'skip' },
          () => 'result'
        );

      const step = flow.getStepDefinition('step1');
      expect(step.options.whenFailed).toBe('skip');
    });

    it('should accept whenFailed: fail (default behavior)', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', whenFailed: 'fail' },
          () => 'result'
        );

      const step = flow.getStepDefinition('step1');
      expect(step.options.whenFailed).toBe('fail');
    });

    it('should accept whenFailed: skip-cascade', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', whenFailed: 'skip-cascade' },
          () => 'result'
        );

      const step = flow.getStepDefinition('step1');
      expect(step.options.whenFailed).toBe('skip-cascade');
    });

    it('should accept whenFailed on dependent steps', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => ({ data: 'test' }))
        .step(
          {
            slug: 'second',
            dependsOn: ['first'],
            whenFailed: 'skip',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('second');
      expect(step.options.whenFailed).toBe('skip');
    });

    it('should accept whenFailed together with other options', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          {
            slug: 'step1',
            maxAttempts: 3,
            timeout: 60,
            whenFailed: 'skip-cascade',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('step1');
      expect(step.options.maxAttempts).toBe(3);
      expect(step.options.timeout).toBe(60);
      expect(step.options.whenFailed).toBe('skip-cascade');
    });

    it('should accept both whenUnmet and whenFailed together', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          {
            slug: 'step1',
            condition: { enabled: true },
            whenUnmet: 'skip',
            whenFailed: 'skip-cascade',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('step1');
      expect(step.options.condition).toEqual({ enabled: true });
      expect(step.options.whenUnmet).toBe('skip');
      expect(step.options.whenFailed).toBe('skip-cascade');
    });
  });

  describe('compileFlow includes when_failed parameter', () => {
    it('should compile when_failed for step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', whenFailed: 'skip' },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_failed => 'skip'");
    });

    it('should compile when_failed: fail', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', whenFailed: 'fail' },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_failed => 'fail'");
    });

    it('should compile when_failed: skip-cascade', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', whenFailed: 'skip-cascade' },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_failed => 'skip-cascade'");
    });

    it('should compile step with all options including whenFailed', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          {
            slug: 'step1',
            maxAttempts: 3,
            timeout: 60,
            condition: { enabled: true },
            whenUnmet: 'skip',
            whenFailed: 'skip-cascade',
          },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain('max_attempts => 3');
      expect(statements[1]).toContain('timeout => 60');
      expect(statements[1]).toContain("condition_pattern => '{\"enabled\":true}'");
      expect(statements[1]).toContain("when_unmet => 'skip'");
      expect(statements[1]).toContain("when_failed => 'skip-cascade'");
    });

    it('should not include when_failed when not specified', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1' },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).not.toContain('when_failed');
    });
  });

  describe('whenFailed on map steps', () => {
    it('should accept whenFailed on map step', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' })
        .map(
          { slug: 'map_step', whenFailed: 'skip' },
          (item) => item.toUpperCase()
        );

      const step = flow.getStepDefinition('map_step');
      expect(step.options.whenFailed).toBe('skip');
    });

    it('should compile when_failed for map step', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' })
        .map(
          { slug: 'map_step', whenFailed: 'skip-cascade' },
          (item) => item.toUpperCase()
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_failed => 'skip-cascade'");
    });
  });
});
