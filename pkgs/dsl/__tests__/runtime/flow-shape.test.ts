import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import {
  extractFlowShape,
  compareFlowShapes,
  FlowShape,
} from '../../src/flow-shape.js';

describe('extractFlowShape', () => {
  describe('basic flow extraction', () => {
    it('should extract shape from a simple flow with no steps', () => {
      const flow = new Flow({ slug: 'test_flow' });
      const shape = extractFlowShape(flow);

      expect(shape).toEqual({
        steps: [],
      });
    });

    it('should include flow runtime options in shape', () => {
      // Options are included for flow creation, but not compared
      const flow = new Flow({
        slug: 'test_flow',
        maxAttempts: 5,
        baseDelay: 10,
        timeout: 120,
      });
      const shape = extractFlowShape(flow);

      // Shape should include options for creation
      expect(shape).toEqual({
        steps: [],
        options: {
          maxAttempts: 5,
          baseDelay: 10,
          timeout: 120,
        },
      });
    });

    it('should omit flow options key when no options defined', () => {
      const flow = new Flow({ slug: 'test_flow' });
      const shape = extractFlowShape(flow);

      // No options = no options key in shape
      expect(shape).toEqual({ steps: [] });
      expect('options' in shape).toBe(false);
    });
  });

  describe('step extraction', () => {
    it('should extract a single step with no dependencies', () => {
      const flow = new Flow<string>({ slug: 'test_flow' }).step(
        { slug: 'step1' },
        (flowInput) => flowInput.toUpperCase()
      );
      const shape = extractFlowShape(flow);

      expect(shape.steps).toHaveLength(1);
      expect(shape.steps[0]).toEqual({
        slug: 'step1',
        stepType: 'single',
        dependencies: [],
      });
    });

    it('should extract step with dependencies', () => {
      const flow = new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'step1' }, (flowInput) => flowInput)
        .step({ slug: 'step2', dependsOn: ['step1'] }, (deps) => deps.step1);
      const shape = extractFlowShape(flow);

      expect(shape.steps).toHaveLength(2);
      expect(shape.steps[1].dependencies).toEqual(['step1']);
    });

    it('should sort dependencies alphabetically', () => {
      const flow = new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'zebra' }, () => 'z')
        .step({ slug: 'apple' }, () => 'a')
        .step({ slug: 'mango' }, () => 'm')
        .step(
          { slug: 'combined', dependsOn: ['zebra', 'apple', 'mango'] },
          () => 'combined'
        );
      const shape = extractFlowShape(flow);

      // Dependencies should be sorted alphabetically
      expect(shape.steps[3].dependencies).toEqual(['apple', 'mango', 'zebra']);
    });

    it('should include step runtime options in shape', () => {
      // Options are included for step creation, but not compared
      const flow = new Flow<string>({ slug: 'test_flow' }).step(
        {
          slug: 'step1',
          maxAttempts: 3,
          baseDelay: 5,
          timeout: 30,
          startDelay: 100,
        },
        (flowInput) => flowInput
      );
      const shape = extractFlowShape(flow);

      // Step shape should include options for creation
      expect(shape.steps[0]).toEqual({
        slug: 'step1',
        stepType: 'single',
        dependencies: [],
        options: {
          maxAttempts: 3,
          baseDelay: 5,
          timeout: 30,
          startDelay: 100,
        },
      });
    });

    it('should omit step options key when no options defined', () => {
      const flow = new Flow<string>({ slug: 'test_flow' }).step(
        { slug: 'step1' },
        (flowInput) => flowInput
      );
      const shape = extractFlowShape(flow);

      // No options = no options key in step shape
      expect(shape.steps[0]).toEqual({
        slug: 'step1',
        stepType: 'single',
        dependencies: [],
      });
      expect('options' in shape.steps[0]).toBe(false);
    });

    it('should only include defined options (filter undefined)', () => {
      // When only some options are set, only those should appear
      const flow = new Flow<string>({ slug: 'test_flow', maxAttempts: 5 }).step(
        { slug: 'step1', timeout: 30 },
        (flowInput) => flowInput
      );
      const shape = extractFlowShape(flow);

      // Only defined options should be included
      expect(shape.options).toEqual({ maxAttempts: 5 });
      expect(shape.steps[0].options).toEqual({ timeout: 30 });
    });
  });

  describe('map step extraction', () => {
    it('should extract root map step correctly', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' }).map(
        { slug: 'process_items' },
        (item) => item.toUpperCase()
      );
      const shape = extractFlowShape(flow);

      expect(shape.steps).toHaveLength(1);
      expect(shape.steps[0]).toEqual({
        slug: 'process_items',
        stepType: 'map',
        dependencies: [],
      });
    });

    it('should extract dependent map step correctly', () => {
      const flow = new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'get_items' }, () => ['a', 'b', 'c'])
        .map({ slug: 'process', array: 'get_items' }, (item) =>
          item.toUpperCase()
        );
      const shape = extractFlowShape(flow);

      expect(shape.steps[1]).toEqual({
        slug: 'process',
        stepType: 'map',
        dependencies: ['get_items'],
      });
    });
  });

  describe('complex flow extraction', () => {
    it('should extract a complex flow structure with options', () => {
      const flow = new Flow<{ url: string }>({
        slug: 'analyze_website',
        maxAttempts: 3,
        baseDelay: 5,
        timeout: 10,
      })
        .step({ slug: 'website' }, (flowInput) => ({ content: flowInput.url }))
        .step(
          { slug: 'sentiment', dependsOn: ['website'], maxAttempts: 5, timeout: 30 },
          () => ({ score: 0.8 })
        )
        .step({ slug: 'summary', dependsOn: ['website'] }, () => ({
          text: 'summary',
        }))
        .step(
          { slug: 'save_to_db', dependsOn: ['sentiment', 'summary'] },
          () => true
        );

      const shape = extractFlowShape(flow);

      // Shape should contain structural info AND options
      expect(shape).toEqual({
        steps: [
          {
            slug: 'website',
            stepType: 'single',
            dependencies: [],
          },
          {
            slug: 'sentiment',
            stepType: 'single',
            dependencies: ['website'],
            options: {
              maxAttempts: 5,
              timeout: 30,
            },
          },
          {
            slug: 'summary',
            stepType: 'single',
            dependencies: ['website'],
          },
          {
            slug: 'save_to_db',
            stepType: 'single',
            dependencies: ['sentiment', 'summary'], // sorted alphabetically
          },
        ],
        options: {
          maxAttempts: 3,
          baseDelay: 5,
          timeout: 10,
        },
      });
    });

    it('should preserve step order from flow definition', () => {
      const flow = new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'first' }, () => 1)
        .step({ slug: 'second' }, () => 2)
        .step({ slug: 'third' }, () => 3);
      const shape = extractFlowShape(flow);

      expect(shape.steps.map((s) => s.slug)).toEqual([
        'first',
        'second',
        'third',
      ]);
    });
  });
});

describe('compareFlowShapes', () => {
  describe('matching shapes', () => {
    it('should return match=true for identical shapes', () => {
      const shape: FlowShape = {
        steps: [
          {
            slug: 'step1',
            stepType: 'single',
            dependencies: [],
          },
        ],
      };

      const result = compareFlowShapes(shape, { ...shape });
      expect(result.match).toBe(true);
      expect(result.differences).toEqual([]);
    });

    it('should return match=true for empty flows', () => {
      const shape: FlowShape = {
        steps: [],
      };

      const result = compareFlowShapes(shape, shape);
      expect(result.match).toBe(true);
      expect(result.differences).toEqual([]);
    });
  });

  describe('step comparison - count mismatch', () => {
    it('should detect missing step at end', () => {
      const a: FlowShape = {
        steps: [],
      };
      const b: FlowShape = {
        steps: [
          { slug: 'step1', stepType: 'single', dependencies: [] },
        ],
      };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      expect(result.differences).toContain('Step count differs: 0 vs 1');
      expect(result.differences).toContain(
        "Step at index 0: missing in first shape (second has 'step1')"
      );
    });

    it('should detect extra step at end', () => {
      const a: FlowShape = {
        steps: [
          { slug: 'step1', stepType: 'single', dependencies: [] },
        ],
      };
      const b: FlowShape = { steps: [] };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      expect(result.differences).toContain('Step count differs: 1 vs 0');
      expect(result.differences).toContain(
        "Step at index 0: missing in second shape (first has 'step1')"
      );
    });

    it('should detect different steps at same positions', () => {
      const a: FlowShape = {
        steps: [
          { slug: 'step_a', stepType: 'single', dependencies: [] },
          { slug: 'step_b', stepType: 'single', dependencies: [] },
        ],
      };
      const b: FlowShape = {
        steps: [
          { slug: 'step_c', stepType: 'single', dependencies: [] },
          { slug: 'step_d', stepType: 'single', dependencies: [] },
        ],
      };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      expect(result.differences).toContain(
        "Step at index 0: slug differs 'step_a' vs 'step_c'"
      );
      expect(result.differences).toContain(
        "Step at index 1: slug differs 'step_b' vs 'step_d'"
      );
    });
  });

  describe('step comparison - order', () => {
    it('should detect steps in different order', () => {
      const a: FlowShape = {
        steps: [
          { slug: 'step_a', stepType: 'single', dependencies: [] },
          { slug: 'step_b', stepType: 'single', dependencies: [] },
        ],
      };
      const b: FlowShape = {
        steps: [
          { slug: 'step_b', stepType: 'single', dependencies: [] },
          { slug: 'step_a', stepType: 'single', dependencies: [] },
        ],
      };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      expect(result.differences).toContain(
        "Step at index 0: slug differs 'step_a' vs 'step_b'"
      );
      expect(result.differences).toContain(
        "Step at index 1: slug differs 'step_b' vs 'step_a'"
      );
    });
  });

  describe('step comparison - stepType', () => {
    it('should detect stepType difference', () => {
      const a: FlowShape = {
        steps: [
          { slug: 'step1', stepType: 'single', dependencies: [] },
        ],
      };
      const b: FlowShape = {
        steps: [
          { slug: 'step1', stepType: 'map', dependencies: [] },
        ],
      };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      expect(result.differences).toContain(
        "Step at index 0: type differs 'single' vs 'map'"
      );
    });
  });

  describe('step comparison - dependencies', () => {
    it('should detect added dependency', () => {
      const a: FlowShape = {
        steps: [
          { slug: 'step1', stepType: 'single', dependencies: [] },
        ],
      };
      const b: FlowShape = {
        steps: [
          {
            slug: 'step1',
            stepType: 'single',
            dependencies: ['step0'],
          },
        ],
      };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      expect(result.differences).toContain(
        'Step at index 0: dependencies differ [] vs [step0]'
      );
    });

    it('should detect removed dependency', () => {
      const a: FlowShape = {
        steps: [
          {
            slug: 'step1',
            stepType: 'single',
            dependencies: ['dep1', 'dep2'],
          },
        ],
      };
      const b: FlowShape = {
        steps: [
          {
            slug: 'step1',
            stepType: 'single',
            dependencies: ['dep1'],
          },
        ],
      };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      expect(result.differences).toContain(
        'Step at index 0: dependencies differ [dep1, dep2] vs [dep1]'
      );
    });

    it('should detect changed dependency', () => {
      const a: FlowShape = {
        steps: [
          {
            slug: 'step1',
            stepType: 'single',
            dependencies: ['old_dep'],
          },
        ],
      };
      const b: FlowShape = {
        steps: [
          {
            slug: 'step1',
            stepType: 'single',
            dependencies: ['new_dep'],
          },
        ],
      };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      expect(result.differences).toContain(
        'Step at index 0: dependencies differ [old_dep] vs [new_dep]'
      );
    });
  });

  describe('options are included in shape but NOT compared', () => {
    it('should match flows with same structure but different DSL options', () => {
      // This is the key behavior: options are in shape for creation,
      // but don't affect shape matching (runtime tunable via SQL)
      const flowA = new Flow<string>({ slug: 'test_flow', maxAttempts: 3 }).step(
        { slug: 'step1', timeout: 60 },
        (flowInput) => flowInput
      );

      const flowB = new Flow<string>({ slug: 'test_flow', maxAttempts: 10 }).step(
        { slug: 'step1', timeout: 300, startDelay: 100 },
        (flowInput) => flowInput
      );

      const shapeA = extractFlowShape(flowA);
      const shapeB = extractFlowShape(flowB);

      // Verify options ARE included in shapes
      expect(shapeA.options).toEqual({ maxAttempts: 3 });
      expect(shapeB.options).toEqual({ maxAttempts: 10 });
      expect(shapeA.steps[0].options).toEqual({ timeout: 60 });
      expect(shapeB.steps[0].options).toEqual({ timeout: 300, startDelay: 100 });

      // But comparison ignores options - only structure matters
      const result = compareFlowShapes(shapeA, shapeB);
      expect(result.match).toBe(true);
      expect(result.differences).toEqual([]);
    });
  });

  describe('multiple differences', () => {
    it('should report all structural differences found', () => {
      const a: FlowShape = {
        steps: [
          {
            slug: 'step1',
            stepType: 'single',
            dependencies: [],
          },
        ],
      };
      const b: FlowShape = {
        steps: [
          {
            slug: 'step1',
            stepType: 'map',
            dependencies: ['dep1'],
          },
          {
            slug: 'step2',
            stepType: 'single',
            dependencies: [],
          },
        ],
      };

      const result = compareFlowShapes(a, b);
      expect(result.match).toBe(false);
      // Should have multiple differences
      expect(result.differences.length).toBeGreaterThan(2);
      // Check specific differences are reported
      expect(result.differences).toContain('Step count differs: 1 vs 2');
      expect(result.differences).toContain(
        "Step at index 0: type differs 'single' vs 'map'"
      );
      expect(result.differences).toContain(
        "Step at index 1: missing in first shape (second has 'step2')"
      );
    });
  });

  describe('integration with extractFlowShape', () => {
    it('should match shapes extracted from identical flows', () => {
      const createFlow = () =>
        new Flow<string>({ slug: 'test_flow', maxAttempts: 3 })
          .step({ slug: 'step1' }, (flowInput) => flowInput)
          .step({ slug: 'step2', dependsOn: ['step1'] }, (deps) => deps.step1);

      const shapeA = extractFlowShape(createFlow());
      const shapeB = extractFlowShape(createFlow());

      const result = compareFlowShapes(shapeA, shapeB);
      expect(result.match).toBe(true);
      expect(result.differences).toEqual([]);
    });

    it('should detect difference when step is added', () => {
      const flowA = new Flow<string>({ slug: 'test_flow' }).step(
        { slug: 'step1' },
        (flowInput) => flowInput
      );

      const flowB = new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'step1' }, (flowInput) => flowInput)
        .step({ slug: 'step2' }, () => 'extra');

      const shapeA = extractFlowShape(flowA);
      const shapeB = extractFlowShape(flowB);

      const result = compareFlowShapes(shapeA, shapeB);
      expect(result.match).toBe(false);
      expect(result.differences).toContain('Step count differs: 1 vs 2');
      expect(result.differences).toContain(
        "Step at index 1: missing in first shape (second has 'step2')"
      );
    });

    it('should detect difference when step type changes', () => {
      const flowA = new Flow<string[]>({ slug: 'test_flow' }).step(
        { slug: 'process' },
        (flowInput) => flowInput.join(',')
      );

      const flowB = new Flow<string[]>({ slug: 'test_flow' }).map(
        { slug: 'process' },
        (item) => item.toUpperCase()
      );

      const shapeA = extractFlowShape(flowA);
      const shapeB = extractFlowShape(flowB);

      const result = compareFlowShapes(shapeA, shapeB);
      expect(result.match).toBe(false);
      expect(result.differences).toContain(
        "Step at index 0: type differs 'single' vs 'map'"
      );
    });

    it('should detect difference when dependencies change', () => {
      const flowA = new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'step1' }, () => 'a')
        .step({ slug: 'step2' }, () => 'b');

      const flowB = new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'step1' }, () => 'a')
        .step({ slug: 'step2', dependsOn: ['step1'] }, () => 'b');

      const shapeA = extractFlowShape(flowA);
      const shapeB = extractFlowShape(flowB);

      const result = compareFlowShapes(shapeA, shapeB);
      expect(result.match).toBe(false);
      expect(result.differences).toContain(
        'Step at index 1: dependencies differ [] vs [step1]'
      );
    });
  });
});
