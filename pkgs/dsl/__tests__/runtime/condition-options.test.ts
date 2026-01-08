import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { compileFlow } from '../../src/compile-flow.js';

describe('Condition Options', () => {
  describe('DSL accepts if and whenUnmet', () => {
    it('should accept if option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'conditional_step', if: { enabled: true } },
        () => 'result'
      );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.if).toEqual({ enabled: true });
    });

    it('should accept whenUnmet option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'conditional_step', whenUnmet: 'skip' },
        () => 'result'
      );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.whenUnmet).toBe('skip');
    });

    it('should accept both if and whenUnmet together', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        {
          slug: 'conditional_step',
          if: { status: 'active' },
          whenUnmet: 'skip-cascade',
        },
        () => 'result'
      );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.if).toEqual({ status: 'active' });
      expect(step.options.whenUnmet).toBe('skip-cascade');
    });

    it('should accept if on dependent steps', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => ({ success: true }))
        .step(
          {
            slug: 'conditional_step',
            dependsOn: ['first'],
            if: { first: { success: true } },
            whenUnmet: 'skip',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('conditional_step');
      expect(step.options.if).toEqual({ first: { success: true } });
      expect(step.options.whenUnmet).toBe('skip');
    });
  });

  describe('compileFlow includes condition parameters', () => {
    it('should compile condition_pattern for root step', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', if: { enabled: true } },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain(
        'condition_pattern => \'{"enabled":true}\''
      );
    });

    it('should compile when_unmet for step', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', whenUnmet: 'fail' },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain("when_unmet => 'fail'");
    });

    it('should compile both condition_pattern and when_unmet together', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        {
          slug: 'step1',
          if: { active: true, type: 'premium' },
          whenUnmet: 'skip-cascade',
        },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain(
        'condition_pattern => \'{"active":true,"type":"premium"}\''
      );
      expect(statements[1]).toContain("when_unmet => 'skip-cascade'");
    });

    it('should compile step with all options including condition', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        {
          slug: 'step1',
          maxAttempts: 3,
          timeout: 60,
          if: { enabled: true },
          whenUnmet: 'skip',
        },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain('max_attempts => 3');
      expect(statements[1]).toContain('timeout => 60');
      expect(statements[1]).toContain(
        'condition_pattern => \'{"enabled":true}\''
      );
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
            whenUnmet: 'skip',
          },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(3);
      expect(statements[2]).toContain("ARRAY['first']");
      expect(statements[2]).toContain(
        'condition_pattern => \'{"first":{"success":true}}\''
      );
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

  describe('DSL accepts ifNot', () => {
    it('should accept ifNot option on a step', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'no_admin_step', ifNot: { role: 'admin' } },
        () => 'result'
      );

      const step = flow.getStepDefinition('no_admin_step');
      expect(step.options.ifNot).toEqual({ role: 'admin' });
    });

    it('should accept both if and ifNot together', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        {
          slug: 'admin_action',
          if: { role: 'admin', active: true },
          ifNot: { suspended: true },
          whenUnmet: 'skip',
        },
        () => 'result'
      );

      const step = flow.getStepDefinition('admin_action');
      expect(step.options.if).toEqual({ role: 'admin', active: true });
      expect(step.options.ifNot).toEqual({ suspended: true });
      expect(step.options.whenUnmet).toBe('skip');
    });

    it('should accept ifNot on dependent steps', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => ({ error: false }))
        .step(
          {
            slug: 'continue_step',
            dependsOn: ['first'],
            ifNot: { first: { error: true } },
            whenUnmet: 'skip',
          },
          () => 'result'
        );

      const step = flow.getStepDefinition('continue_step');
      expect(step.options.ifNot).toEqual({ first: { error: true } });
      expect(step.options.whenUnmet).toBe('skip');
    });
  });

  describe('compileFlow includes ifNot parameters', () => {
    it('should compile condition_not_pattern for root step', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        { slug: 'step1', ifNot: { role: 'admin' } },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain(
        'condition_not_pattern => \'{"role":"admin"}\''
      );
    });

    it('should compile both if and ifNot together', () => {
      const flow = new Flow({ slug: 'test_flow' }).step(
        {
          slug: 'step1',
          if: { active: true },
          ifNot: { suspended: true },
          whenUnmet: 'skip',
        },
        () => 'result'
      );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(2);
      expect(statements[1]).toContain(
        'condition_pattern => \'{"active":true}\''
      );
      expect(statements[1]).toContain(
        'condition_not_pattern => \'{"suspended":true}\''
      );
      expect(statements[1]).toContain("when_unmet => 'skip'");
    });

    it('should compile ifNot for dependent step', () => {
      const flow = new Flow({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => ({ error: false }))
        .step(
          {
            slug: 'second',
            dependsOn: ['first'],
            ifNot: { first: { error: true } },
            whenUnmet: 'skip',
          },
          () => 'result'
        );

      const statements = compileFlow(flow);

      expect(statements).toHaveLength(3);
      expect(statements[2]).toContain("ARRAY['first']");
      expect(statements[2]).toContain(
        'condition_not_pattern => \'{"first":{"error":true}}\''
      );
      expect(statements[2]).toContain("when_unmet => 'skip'");
    });
  });
});
