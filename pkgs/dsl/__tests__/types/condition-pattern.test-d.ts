import { Flow, type ContainmentPattern } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('ContainmentPattern<T> utility type', () => {
  describe('primitive types', () => {
    it('should allow exact value match for string', () => {
      type Pattern = ContainmentPattern<string>;
      expectTypeOf<Pattern>().toEqualTypeOf<string>();
    });

    it('should allow exact value match for number', () => {
      type Pattern = ContainmentPattern<number>;
      expectTypeOf<Pattern>().toEqualTypeOf<number>();
    });

    it('should allow exact value match for boolean', () => {
      type Pattern = ContainmentPattern<boolean>;
      expectTypeOf<Pattern>().toEqualTypeOf<boolean>();
    });

    it('should allow exact value match for null', () => {
      type Pattern = ContainmentPattern<null>;
      expectTypeOf<Pattern>().toEqualTypeOf<null>();
    });
  });

  describe('object types', () => {
    it('should make all keys optional for simple objects', () => {
      type Input = { name: string; age: number };
      type Pattern = ContainmentPattern<Input>;

      // All keys should be optional
      expectTypeOf<Pattern>().toEqualTypeOf<{ name?: string; age?: number }>();
    });

    it('should allow empty object pattern (always matches)', () => {
      type Input = { name: string; age: number };
      type Pattern = ContainmentPattern<Input>;

      // Empty object should be assignable to pattern
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      expectTypeOf<{}>().toMatchTypeOf<Pattern>();
    });

    it('should handle nested objects recursively', () => {
      type Input = { user: { name: string; role: string } };
      type Pattern = ContainmentPattern<Input>;

      // Nested object should have optional keys
      expectTypeOf<Pattern>().toEqualTypeOf<{
        user?: { name?: string; role?: string };
      }>();
    });

    it('should allow partial patterns for nested objects', () => {
      type Input = { user: { name: string; role: string; age: number } };
      type Pattern = ContainmentPattern<Input>;

      // Should be able to specify only some nested keys
      const validPattern: Pattern = { user: { role: 'admin' } };
      expectTypeOf(validPattern).toMatchTypeOf<Pattern>();
    });
  });

  describe('array types', () => {
    it('should allow array containment patterns', () => {
      type Input = string[];
      type Pattern = ContainmentPattern<Input>;

      // Array pattern should be ContainmentPattern<element>[]
      expectTypeOf<Pattern>().toEqualTypeOf<string[]>();
    });

    it('should handle arrays of objects', () => {
      type Input = { type: string; value: number }[];
      type Pattern = ContainmentPattern<Input>;

      // Should allow partial object patterns in array
      expectTypeOf<Pattern>().toEqualTypeOf<{ type?: string; value?: number }[]>();
    });

    it('should allow array pattern with specific elements', () => {
      type Input = { type: string; value: number }[];
      type Pattern = ContainmentPattern<Input>;

      // Should be able to check for specific elements
      const validPattern: Pattern = [{ type: 'error' }];
      expectTypeOf(validPattern).toMatchTypeOf<Pattern>();
    });

    it('should handle readonly arrays', () => {
      type Input = readonly string[];
      type Pattern = ContainmentPattern<Input>;

      // Should work with readonly arrays
      expectTypeOf<Pattern>().toEqualTypeOf<string[]>();
    });
  });

  describe('complex nested structures', () => {
    it('should handle deeply nested objects', () => {
      type Input = {
        level1: {
          level2: {
            level3: { value: string };
          };
        };
      };
      type Pattern = ContainmentPattern<Input>;

      // All levels should have optional keys
      expectTypeOf<Pattern>().toEqualTypeOf<{
        level1?: {
          level2?: {
            level3?: { value?: string };
          };
        };
      }>();
    });

    it('should handle objects with array properties', () => {
      type Input = {
        items: { id: number; name: string }[];
        meta: { count: number };
      };
      type Pattern = ContainmentPattern<Input>;

      expectTypeOf<Pattern>().toEqualTypeOf<{
        items?: { id?: number; name?: string }[];
        meta?: { count?: number };
      }>();
    });
  });
});

describe('condition option typing in step methods', () => {
  describe('root step condition', () => {
    it('should type condition as ContainmentPattern<FlowInput>', () => {
      type FlowInput = { userId: string; role: string };

      // This should compile - valid partial pattern
      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', condition: { role: 'admin' } },
        (input) => input.userId
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should reject invalid keys in condition', () => {
      type FlowInput = { userId: string; role: string };

      // @ts-expect-error - 'invalidKey' does not exist on FlowInput
      new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', condition: { invalidKey: 'value' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (input: any) => input.userId
      );
    });

    it('should reject wrong value types in condition', () => {
      type FlowInput = { userId: string; role: string };

      // @ts-expect-error - role should be string, not number
      new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', condition: { role: 123 } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (input: any) => input.userId
      );
    });

    it('should allow empty object condition (always matches)', () => {
      type FlowInput = { userId: string; role: string };

      // Empty object should be valid
      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', condition: {} },
        (input) => input.userId
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should allow nested object patterns', () => {
      type FlowInput = { user: { name: string; role: string } };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', condition: { user: { role: 'admin' } } },
        (input) => input.user.name
      );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('dependent step condition', () => {
    it('should type condition as ContainmentPattern<DepsObject>', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ status: 'ok', data: 'result' }))
        .step(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            condition: { fetch: { status: 'ok' } },
          },
          (deps) => deps.fetch.data
        );

      expectTypeOf(flow).toBeObject();
    });

    it('should reject invalid dep slug in condition', () => {
      new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ status: 'ok' }))
        .step(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            // @ts-expect-error - 'nonexistent' is not a dependency
            condition: { nonexistent: { status: 'ok' } },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (deps: any) => deps.fetch.status
        );
    });

    it('should reject invalid keys within dep output', () => {
      new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ status: 'ok' }))
        .step(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            // @ts-expect-error - 'invalidField' does not exist on fetch output
            condition: { fetch: { invalidField: 'value' } },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (deps: any) => deps.fetch.status
        );
    });

    it('should handle multiple dependencies in condition', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'step1' }, () => ({ ready: true }))
        .step({ slug: 'step2' }, () => ({ valid: true }))
        .step(
          {
            slug: 'final',
            dependsOn: ['step1', 'step2'],
            condition: { step1: { ready: true }, step2: { valid: true } },
          },
          (deps) => deps.step1.ready && deps.step2.valid
        );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('array step condition', () => {
    it('should type condition for root array step', () => {
      type FlowInput = { items: string[]; enabled: boolean };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).array(
        { slug: 'getItems', condition: { enabled: true } },
        (input) => input.items
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should type condition for dependent array step', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ ready: true, items: ['a', 'b'] }))
        .array(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            condition: { fetch: { ready: true } },
          },
          (deps) => deps.fetch.items
        );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('map step condition', () => {
    it('should type condition for root map step', () => {
      type FlowInput = { type: string; value: number }[];

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).map(
        // Root map condition checks the array itself
        { slug: 'process', condition: [{ type: 'active' }] },
        (item) => item.value * 2
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should type condition for dependent map step', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => [
          { id: 1, active: true },
          { id: 2, active: false },
        ])
        .map(
          {
            slug: 'process',
            array: 'fetch',
            // Condition checks the array dep
            condition: { fetch: [{ active: true }] },
          },
          (item) => item.id
        );

      expectTypeOf(flow).toBeObject();
    });
  });
});
