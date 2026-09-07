import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { extractFlowShape } from '../../src/flow-shape.js';

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
    it('extracts structural modes and patterns for startup compilation', () => {
      const flow = new Flow<{ status: string }>({ slug: 'test_flow' }).step(
        {
          slug: 'conditional',
          if: { status: 'ready' },
          ifNot: { status: 'blocked' },
          whenUnmet: 'skip-cascade',
          whenExhausted: 'skip',
        },
        (input) => input
      );

      expect(extractFlowShape(flow).steps[0]).toMatchObject({
        slug: 'conditional',
        stepType: 'single',
        dependencies: [],
        whenUnmet: 'skip-cascade',
        whenExhausted: 'skip',
        requiredInputPattern: {
          defined: true,
          value: { status: 'ready' },
        },
        forbiddenInputPattern: {
          defined: true,
          value: { status: 'blocked' },
        },
      });
    });

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
        whenUnmet: 'skip',
        whenExhausted: 'fail',
        requiredInputPattern: { defined: false },
        forbiddenInputPattern: { defined: false },
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
        whenUnmet: 'skip',
        whenExhausted: 'fail',
        requiredInputPattern: { defined: false },
        forbiddenInputPattern: { defined: false },
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
        whenUnmet: 'skip',
        whenExhausted: 'fail',
        requiredInputPattern: { defined: false },
        forbiddenInputPattern: { defined: false },
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
        whenUnmet: 'skip',
        whenExhausted: 'fail',
        requiredInputPattern: { defined: false },
        forbiddenInputPattern: { defined: false },
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
        whenUnmet: 'skip',
        whenExhausted: 'fail',
        requiredInputPattern: { defined: false },
        forbiddenInputPattern: { defined: false },
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
          {
            slug: 'sentiment',
            dependsOn: ['website'],
            maxAttempts: 5,
            timeout: 30,
          },
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
            whenUnmet: 'skip',
            whenExhausted: 'fail',
            requiredInputPattern: { defined: false },
            forbiddenInputPattern: { defined: false },
          },
          {
            slug: 'sentiment',
            stepType: 'single',
            dependencies: ['website'],
            whenUnmet: 'skip',
            whenExhausted: 'fail',
            requiredInputPattern: { defined: false },
            forbiddenInputPattern: { defined: false },
            options: {
              maxAttempts: 5,
              timeout: 30,
            },
          },
          {
            slug: 'summary',
            stepType: 'single',
            dependencies: ['website'],
            whenUnmet: 'skip',
            whenExhausted: 'fail',
            requiredInputPattern: { defined: false },
            forbiddenInputPattern: { defined: false },
          },
          {
            slug: 'save_to_db',
            stepType: 'single',
            dependencies: ['sentiment', 'summary'], // sorted alphabetically
            whenUnmet: 'skip',
            whenExhausted: 'fail',
            requiredInputPattern: { defined: false },
            forbiddenInputPattern: { defined: false },
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

    describe('pattern extraction', () => {
      it('should extract requiredInputPattern from step with if option', () => {
        const flow = new Flow<{ status: string }>({ slug: 'test_flow' }).step(
          { slug: 'step1', if: { status: 'active' } },
          (flowInput) => flowInput
        );
        const shape = extractFlowShape(flow);

        expect(shape.steps[0]).toEqual({
          slug: 'step1',
          stepType: 'single',
          dependencies: [],
          whenUnmet: 'skip',
          whenExhausted: 'fail',
          requiredInputPattern: { defined: true, value: { status: 'active' } },
          forbiddenInputPattern: { defined: false },
        });
      });

      it('should extract forbiddenInputPattern from step with ifNot option', () => {
        const flow = new Flow<{ status: string }>({ slug: 'test_flow' }).step(
          { slug: 'step1', ifNot: { status: 'deleted' } },
          (flowInput) => flowInput
        );
        const shape = extractFlowShape(flow);

        expect(shape.steps[0]).toEqual({
          slug: 'step1',
          stepType: 'single',
          dependencies: [],
          whenUnmet: 'skip',
          whenExhausted: 'fail',
          requiredInputPattern: { defined: false },
          forbiddenInputPattern: {
            defined: true,
            value: { status: 'deleted' },
          },
        });
      });

      it('should extract both pattern fields when both if and ifNot are set', () => {
        const flow = new Flow<{ status: string; type: string }>({
          slug: 'test_flow',
        }).step(
          {
            slug: 'step1',
            if: { status: 'active' },
            ifNot: { type: 'archived' },
          },
          (flowInput) => flowInput
        );
        const shape = extractFlowShape(flow);

        expect(shape.steps[0]).toEqual({
          slug: 'step1',
          stepType: 'single',
          dependencies: [],
          whenUnmet: 'skip',
          whenExhausted: 'fail',
          requiredInputPattern: { defined: true, value: { status: 'active' } },
          forbiddenInputPattern: { defined: true, value: { type: 'archived' } },
        });
      });

      it('should include pattern keys with defined:false when no patterns are set', () => {
        const flow = new Flow<string>({ slug: 'test_flow' }).step(
          { slug: 'step1' },
          (flowInput) => flowInput
        );
        const shape = extractFlowShape(flow);

        expect(shape.steps[0]).toEqual({
          slug: 'step1',
          stepType: 'single',
          dependencies: [],
          whenUnmet: 'skip',
          whenExhausted: 'fail',
          requiredInputPattern: { defined: false },
          forbiddenInputPattern: { defined: false },
        });
        // Pattern keys are now always present with the wrapper format
        expect('requiredInputPattern' in shape.steps[0]).toBe(true);
        expect('forbiddenInputPattern' in shape.steps[0]).toBe(true);
      });
    });
  });
});
