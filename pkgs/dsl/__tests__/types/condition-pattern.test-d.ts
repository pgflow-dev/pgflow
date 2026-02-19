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
      expectTypeOf<Pattern>().toEqualTypeOf<
        { type?: string; value?: number }[]
      >();
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

describe('if option typing in step methods', () => {
  describe('root step if', () => {
    it('should type if as ContainmentPattern<FlowInput>', () => {
      type FlowInput = { userId: string; role: string };

      // This should compile - valid partial pattern
      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', if: { role: 'admin' } },
        (input) => input.userId
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should reject invalid keys in if', () => {
      type FlowInput = { userId: string; role: string };

      new Flow<FlowInput>({ slug: 'test_flow' }).step(
        // @ts-expect-error - 'invalidKey' does not exist on FlowInput
        { slug: 'check', if: { invalidKey: 'value' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (input: any) => input.userId
      );
    });

    it('should reject wrong value types in if', () => {
      type FlowInput = { userId: string; role: string };

      new Flow<FlowInput>({ slug: 'test_flow' }).step(
        // @ts-expect-error - role should be string, not number
        { slug: 'check', if: { role: 123 } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (input: any) => input.userId
      );
    });

    it('should allow empty object if (always matches)', () => {
      type FlowInput = { userId: string; role: string };

      // Empty object should be valid
      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', if: {} },
        (input) => input.userId
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should allow nested object patterns', () => {
      type FlowInput = { user: { name: string; role: string } };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', if: { user: { role: 'admin' } } },
        (input) => input.user.name
      );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('dependent step if', () => {
    it('should type if as ContainmentPattern<DepsObject>', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ status: 'ok', data: 'result' }))
        .step(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            if: { fetch: { status: 'ok' } },
          },
          (deps) => deps.fetch.data
        );

      expectTypeOf(flow).toBeObject();
    });

    it('should reject invalid dep slug in if', () => {
      new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ status: 'ok' }))
        .step(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            // @ts-expect-error - 'nonexistent' is not a dependency
            if: { nonexistent: { status: 'ok' } },
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
            if: { fetch: { invalidField: 'value' } },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (deps: any) => deps.fetch.status
        );
    });

    it('should handle multiple dependencies in if', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'step1' }, () => ({ ready: true }))
        .step({ slug: 'step2' }, () => ({ valid: true }))
        .step(
          {
            slug: 'final',
            dependsOn: ['step1', 'step2'],
            if: { step1: { ready: true }, step2: { valid: true } },
          },
          (deps) => deps.step1.ready && deps.step2.valid
        );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('array step if', () => {
    it('should type if for root array step', () => {
      type FlowInput = { items: string[]; enabled: boolean };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).array(
        { slug: 'getItems', if: { enabled: true } },
        (input) => input.items
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should type if for dependent array step', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ ready: true, items: ['a', 'b'] }))
        .array(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            if: { fetch: { ready: true } },
          },
          (deps) => deps.fetch.items
        );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('map step if', () => {
    it('should type if for root map step', () => {
      type FlowInput = { type: string; value: number }[];

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).map(
        // Root map if checks the array itself
        { slug: 'process', if: [{ type: 'active' }] },
        (item) => item.value * 2
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should type if for dependent map step', () => {
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
            if: { fetch: [{ active: true }] },
          },
          (item) => item.id
        );

      expectTypeOf(flow).toBeObject();
    });
  });
});

describe('ifNot option typing in step methods', () => {
  describe('root step ifNot', () => {
    it('should type ifNot as ContainmentPattern<FlowInput>', () => {
      type FlowInput = { userId: string; role: string };

      // This should compile - valid partial pattern
      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'check', ifNot: { role: 'admin' } },
        (input) => input.userId
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should reject invalid keys in ifNot', () => {
      type FlowInput = { userId: string; role: string };

      new Flow<FlowInput>({ slug: 'test_flow' }).step(
        // @ts-expect-error - 'invalidKey' does not exist on FlowInput
        { slug: 'check', ifNot: { invalidKey: 'value' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (input: any) => input.userId
      );
    });

    it('should reject wrong value types in ifNot', () => {
      type FlowInput = { userId: string; role: string };

      new Flow<FlowInput>({ slug: 'test_flow' }).step(
        // @ts-expect-error - role should be string, not number
        { slug: 'check', ifNot: { role: 123 } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (input: any) => input.userId
      );
    });

    it('should allow combined if and ifNot', () => {
      type FlowInput = { role: string; active: boolean; suspended?: boolean };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        {
          slug: 'admin_action',
          if: { role: 'admin', active: true },
          ifNot: { suspended: true },
        },
        (input) => input.role
      );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('dependent step ifNot', () => {
    it('should type ifNot as ContainmentPattern<DepsObject>', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ hasError: true, data: 'result' }))
        .step(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            ifNot: { fetch: { hasError: true } },
          },
          (deps) => deps.fetch.data
        );

      expectTypeOf(flow).toBeObject();
    });

    it('should reject invalid dep slug in ifNot', () => {
      new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ status: 'ok' }))
        .step(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            // @ts-expect-error - 'nonexistent' is not a dependency
            ifNot: { nonexistent: { status: 'error' } },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (deps: any) => deps.fetch.status
        );
    });

    it('should reject invalid keys within dep output for ifNot', () => {
      new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ status: 'ok' }))
        .step(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            // @ts-expect-error - 'invalidField' does not exist on fetch output
            ifNot: { fetch: { invalidField: 'value' } },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (deps: any) => deps.fetch.status
        );
    });
  });

  describe('array step ifNot', () => {
    it('should type ifNot for root array step', () => {
      type FlowInput = { items: string[]; disabled: boolean };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).array(
        { slug: 'getItems', ifNot: { disabled: true } },
        (input) => input.items
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should type ifNot for dependent array step', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ error: false, items: ['a', 'b'] }))
        .array(
          {
            slug: 'process',
            dependsOn: ['fetch'],
            ifNot: { fetch: { error: true } },
          },
          (deps) => deps.fetch.items
        );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('map step ifNot', () => {
    it('should type ifNot for root map step', () => {
      type FlowInput = { type: string; value: number }[];

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).map(
        // Root map ifNot checks the array itself
        { slug: 'process', ifNot: [{ type: 'disabled' }] },
        (item) => item.value * 2
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should type ifNot for dependent map step', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => [
          { id: 1, deleted: false },
          { id: 2, deleted: true },
        ])
        .map(
          {
            slug: 'process',
            array: 'fetch',
            // Condition checks the array dep
            ifNot: { fetch: [{ deleted: true }] },
          },
          (item) => item.id
        );

      expectTypeOf(flow).toBeObject();
    });
  });
});

describe('whenUnmet requires if or ifNot', () => {
  describe('step method', () => {
    it('should allow whenUnmet with if', () => {
      type FlowInput = { role: string };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'admin', if: { role: 'admin' }, whenUnmet: 'skip' },
        (input) => input.role
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should allow whenUnmet with ifNot', () => {
      type FlowInput = { role: string };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        { slug: 'non_admin', ifNot: { role: 'admin' }, whenUnmet: 'skip' },
        (input) => input.role
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should allow whenUnmet with both if and ifNot', () => {
      type FlowInput = { role: string; suspended: boolean };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).step(
        {
          slug: 'active_admin',
          if: { role: 'admin' },
          ifNot: { suspended: true },
          whenUnmet: 'skip-cascade',
        },
        (input) => input.role
      );

      expectTypeOf(flow).toBeObject();
    });

    it('should infer omitted whenUnmet as skip when condition is present', () => {
      const flow = new Flow<{ active: boolean }>({ slug: 'test_flow' })
        .step({ slug: 'conditioned', if: { active: true } }, () => 'ok')
        .step({ slug: 'consumer', dependsOn: ['conditioned'] }, (deps) => {
          expectTypeOf(deps).toEqualTypeOf<{ conditioned?: string }>();
          return deps.conditioned ?? 'fallback';
        });

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('array method', () => {
    it('should allow whenUnmet with if on array step', () => {
      type FlowInput = { items: string[]; enabled: boolean };

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).array(
        { slug: 'getItems', if: { enabled: true }, whenUnmet: 'skip' },
        (input) => input.items
      );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('map method', () => {
    it('should allow whenUnmet with ifNot on map step', () => {
      type FlowInput = { type: string; value: number }[];

      const flow = new Flow<FlowInput>({ slug: 'test_flow' }).map(
        { slug: 'process', ifNot: [{ type: 'disabled' }], whenUnmet: 'skip' },
        (item) => item.value
      );

      expectTypeOf(flow).toBeObject();
    });
  });

  describe('whenUnmet rejection tests', () => {
    it('should reject whenUnmet without if or ifNot on root step', () => {
      type FlowInput = { role: string };

      new Flow<FlowInput>({ slug: 'test_flow' })
        // @ts-expect-error - whenUnmet requires if or ifNot
        .step({ slug: 'step', whenUnmet: 'skip' }, (input) => input.role);
    });

    it('should reject whenUnmet without if or ifNot on dependent step', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' }).step(
        { slug: 'first' },
        () => ({ done: true })
      );

      flow.step(
        // @ts-expect-error - whenUnmet requires if or ifNot
        { slug: 'second', dependsOn: ['first'], whenUnmet: 'skip' },
        // Handler typed as any to suppress cascading error from failed overload
        (deps: any) => deps.first.done
      );
    });

    it('should reject whenUnmet without if or ifNot on root array step', () => {
      type FlowInput = { items: string[] };

      new Flow<FlowInput>({ slug: 'test_flow' })
        // @ts-expect-error - whenUnmet requires if or ifNot
        .array({ slug: 'getItems', whenUnmet: 'skip' }, (input) => input.items);
    });

    it('should reject whenUnmet without if or ifNot on dependent array step', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' }).step(
        { slug: 'fetch' },
        () => ({ items: ['a', 'b'] })
      );

      // @ts-expect-error - whenUnmet requires if or ifNot
      flow.array(
        { slug: 'process', dependsOn: ['fetch'], whenUnmet: 'skip' },
        // Handler typed as any to suppress cascading error from failed overload
        (deps: any) => deps.fetch.items
      );
    });

    it('should reject whenUnmet without if or ifNot on root map step', () => {
      type FlowInput = { value: number }[];

      new Flow<FlowInput>({ slug: 'test_flow' })
        // @ts-expect-error - whenUnmet requires if or ifNot
        .map({ slug: 'process', whenUnmet: 'skip' }, (item) => item.value);
    });

    it('should reject whenUnmet without if or ifNot on dependent map step', () => {
      const flow = new Flow<{ initial: string }>({ slug: 'test_flow' }).step(
        { slug: 'fetch' },
        () => [{ id: 1 }, { id: 2 }]
      );

      // @ts-expect-error - whenUnmet requires if or ifNot
      flow.map(
        { slug: 'process', array: 'fetch', whenUnmet: 'skip' },
        // Handler typed as any to suppress cascading error from failed overload
        (item: any) => item.id
      );
    });
  });
});
