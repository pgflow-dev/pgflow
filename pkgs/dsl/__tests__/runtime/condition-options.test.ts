import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { compileFlow } from '../../src/compile-flow.js';

describe('Condition Options', () => {
  describe('DSL accepts if and else', () => {
    it('should accept if option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'conditional_step', if: { enabled: true } },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.if).toEqual({ enabled: true });
    });

    it('should accept else option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'conditional_step', else: 'skip' },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.else).toBe('skip');
    });

    it('should accept both if and else together', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          {
            slug: 'conditional_step',
            if: { status: 'active' },
            else: 'skip-cascade',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.if).toEqual({ status: 'active' });
      expect(step.options.else).toBe('skip-cascade');
    });

    it('should accept if on dependent steps', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => ({ success: true }))
        .step(
          {
            slug: 'conditional_step',
            dependsOn: ['first'],
            if: { first: { success: true } },
            else: 'skip',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.if).toEqual({ first: { success: true } });
      expect(step.options.else).toBe('skip');
    });
  });

  describe('compileFlow includes condition parameters', () => {
    it('should compile condition_pattern for root step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', if: { enabled: true } },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("condition_pattern => '{\"enabled\":true}'");
    });

    it('should compile when_unmet for step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step(
          { slug: 'step1', else: 'fail' },
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
            if: { active: true, type: 'premium' },
            else: 'skip-cascade',
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
            if: { enabled: true },
            else: 'skip',
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
            if: { first: { success: true } },
            else: 'skip',
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

  describe('else validation', () => {
    it('should only accept valid else values', () => {
      // Valid values should work
      expect(() =>
        new Flow({ slug: 'test' }).step(
          { slug: 's1', else: 'fail' },
          () => 1
        )
      ).not.toThrow();

      expect(() =>
        new Flow({ slug: 'test' }).step(
          { slug: 's1', else: 'skip' },
          () => 1
        )
      ).not.toThrow();

      expect(() =>
        new Flow({ slug: 'test' }).step(
          { slug: 's1', else: 'skip-cascade' },
          () => 1
        )
      ).not.toThrow();
    });
  });
});
