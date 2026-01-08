import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { compileFlow } from '../../src/compile-flow.js';

describe('Condition Options', () => {
  describe('DSL accepts condition and whenUnmet', () => {
    it('should accept condition option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'conditional_step', condition: { enabled: true } },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.condition).toEqual({ enabled: true });
    });

    it('should accept whenUnmet option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'conditional_step', whenUnmet: 'skip' },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.whenUnmet).toBe('skip');
    });

    it('should accept both condition and whenUnmet together', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          {
            slug: 'conditional_step',
            condition: { status: 'active' },
            whenUnmet: 'skip-cascade',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.condition).toEqual({ status: 'active' });
      expect(step.options.whenUnmet).toBe('skip-cascade');
    });

    it('should accept condition on dependent steps', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => ({ success: true }))
        .step(
          {
            slug: 'conditional_step',
            dependsOn: ['first'],
            condition: { first: { success: true } },
            whenUnmet: 'skip',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.condition).toEqual({ first: { success: true } });
      expect(step.options.whenUnmet).toBe('skip');
    });
  });

  describe('compileFlow includes condition parameters', () => {
    it('should compile condition_pattern for root step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', condition: { enabled: true } },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("condition_pattern => '{\"enabled\":true}'");
    });

    it('should compile when_unmet for step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', whenUnmet: 'fail' },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_unmet => 'fail'");
    });

    it('should compile both condition_pattern and when_unmet together', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          {
            slug: 'step1',
            condition: { active: true, type: 'premium' },
            whenUnmet: 'skip-cascade',
          },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("condition_pattern => '{\"active\":true,\"type\":\"premium\"}'");
      expect(statements[1]).toContain("when_unmet => 'skip-cascade'");
    });

    it('should compile step with all options including condition', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          {
            slug: 'step1',
            maxAttempts: 3,
            timeout: 60,
            condition: { enabled: true },
            whenUnmet: 'skip',
          },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain('max_attempts => 3');
      expect(statements[1]).toContain('timeout => 60');
      expect(statements[1]).toContain("condition_pattern => '{\"enabled\":true}'");
      expect(statements[1]).toContain("when_unmet => 'skip'");
    });

    it('should compile dependent step with condition checking deps output', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => ({ success: true }))
        .step(
          {
            slug: 'second',
            dependsOn: ['first'],
            condition: { first: { success: true } },
            whenUnmet: 'skip',
          },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(3);
      expect(statements[2]).toContain("ARRAY['first']");
      expect(statements[2]).toContain("condition_pattern => '{\"first\":{\"success\":true}}'");
      expect(statements[2]).toContain("when_unmet => 'skip'");
    });
  });

  describe('whenUnmet validation', () => {
    it('should only accept valid whenUnmet values', () => {
      // Valid values should work
      expect(() =>
        new Flow({ slug: 'test' }).step(
          { slug: 's1', whenUnmet: 'fail' },
          () => 1
        )
      ).not.toThrow();

      expect(() =>
        new Flow({ slug: 'test' }).step(
          { slug: 's1', whenUnmet: 'skip' },
          () => 1
        )
      ).not.toThrow();

      expect(() =>
        new Flow({ slug: 'test' }).step(
          { slug: 's1', whenUnmet: 'skip-cascade' },
          () => 1
        )
      ).not.toThrow();
    });
  });
});
