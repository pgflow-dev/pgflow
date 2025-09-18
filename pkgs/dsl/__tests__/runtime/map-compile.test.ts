import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { compileFlow } from '../../src/compile-flow.js';

describe('compileFlow with map steps', () => {
  describe('root map compilation', () => {
    it('should compile root map with step_type parameter', () => {
      const flow = new Flow<number[]>({ slug: 'test_flow' })
        .map({ slug: 'square' }, (n) => n * n);

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(2);
      expect(sql[0]).toBe("SELECT pgflow.create_flow('test_flow');");
      expect(sql[1]).toContain("step_type => 'map'");
      expect(sql[1]).not.toContain("ARRAY["); // No dependencies for root map
      expect(sql[1]).toBe("SELECT pgflow.add_step('test_flow', 'square', step_type => 'map');");
    });

    it('should compile root map with runtime options', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' })
        .map({
          slug: 'process',
          maxAttempts: 5,
          baseDelay: 10,
          timeout: 60
        }, (item) => item.toUpperCase());

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(2);
      expect(sql[1]).toContain("step_type => 'map'");
      expect(sql[1]).toContain("max_attempts => 5");
      expect(sql[1]).toContain("base_delay => 10");
      expect(sql[1]).toContain("timeout => 60");
      expect(sql[1]).toBe(
        "SELECT pgflow.add_step('test_flow', 'process', max_attempts => 5, base_delay => 10, timeout => 60, step_type => 'map');"
      );
    });

    it('should compile root map with startDelay option', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' })
        .map({
          slug: 'delayed',
          startDelay: 300
        }, (item) => item.length);

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(2);
      expect(sql[1]).toContain("start_delay => 300");
      expect(sql[1]).toContain("step_type => 'map'");
    });
  });

  describe('dependent map compilation', () => {
    it('should compile dependent map with array dependency', () => {
      const flow = new Flow<{ count: number }>({ slug: 'test_flow' })
        .array({ slug: 'nums' }, ({ run }) => Array(run.count).fill(0).map((_, i) => i))
        .map({ slug: 'double', array: 'nums' }, (n) => n * 2);

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(3);
      expect(sql[0]).toBe("SELECT pgflow.create_flow('test_flow');");
      expect(sql[1]).toBe("SELECT pgflow.add_step('test_flow', 'nums');");
      expect(sql[2]).toContain("ARRAY['nums']");
      expect(sql[2]).toContain("step_type => 'map'");
      expect(sql[2]).toBe("SELECT pgflow.add_step('test_flow', 'double', ARRAY['nums'], step_type => 'map');");
    });

    it('should compile dependent map with options', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ['a', 'b', 'c'])
        .map({
          slug: 'process',
          array: 'fetch',
          maxAttempts: 3,
          timeout: 30
        }, (item) => ({ processed: item }));

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(3);
      expect(sql[2]).toContain("ARRAY['fetch']");
      expect(sql[2]).toContain("step_type => 'map'");
      expect(sql[2]).toContain("max_attempts => 3");
      expect(sql[2]).toContain("timeout => 30");
    });
  });

  describe('mixed step types', () => {
    it('should compile flow with map and regular steps', () => {
      const flow = new Flow<number[]>({ slug: 'test_flow' })
        .map({ slug: 'double' }, (n) => n * 2)
        .step({ slug: 'sum', dependsOn: ['double'] }, (input) =>
          input.double.reduce((a, b) => a + b, 0)
        );

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(3);
      expect(sql[1]).toContain("step_type => 'map'");
      expect(sql[2]).not.toContain("step_type"); // Regular step doesn't need step_type
      expect(sql[2]).toContain("ARRAY['double']");
    });

    it('should compile map chaining', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' })
        .map({ slug: 'uppercase' }, (s) => s.toUpperCase())
        .map({ slug: 'lengths', array: 'uppercase' }, (s) => s.length);

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(3);
      expect(sql[1]).toContain("step_type => 'map'");
      expect(sql[1]).not.toContain("ARRAY["); // Root map
      expect(sql[2]).toContain("step_type => 'map'");
      expect(sql[2]).toContain("ARRAY['uppercase']");
    });

    it('should compile array to map to step chain', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test_flow' })
        .array({ slug: 'generate' }, () => [1, 2, 3])
        .map({ slug: 'square', array: 'generate' }, (n) => n * n)
        .step({ slug: 'total', dependsOn: ['square'] }, (input) => ({
          sum: input.square.reduce((a, b) => a + b, 0)
        }));

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(4);
      expect(sql[1]).not.toContain("step_type"); // Array step
      expect(sql[2]).toContain("step_type => 'map'");
      expect(sql[2]).toContain("ARRAY['generate']");
      expect(sql[3]).not.toContain("step_type"); // Regular step
      expect(sql[3]).toContain("ARRAY['square']");
    });
  });

  describe('flow with only map steps', () => {
    it('should compile flow with only root map', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' })
        .map({ slug: 'process' }, (s) => s.toUpperCase());

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(2);
      expect(sql[1]).toBe("SELECT pgflow.add_step('test_flow', 'process', step_type => 'map');");
    });

    it('should compile flow with multiple map steps', () => {
      const flow = new Flow<number[]>({ slug: 'test_flow' })
        .map({ slug: 'double' }, (n) => n * 2)
        .map({ slug: 'square', array: 'double' }, (n) => n * n)
        .map({ slug: 'stringify', array: 'square' }, (n) => String(n));

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(4);
      expect(sql[1]).toContain("step_type => 'map'");
      expect(sql[1]).not.toContain("ARRAY[");
      expect(sql[2]).toContain("step_type => 'map'");
      expect(sql[2]).toContain("ARRAY['double']");
      expect(sql[3]).toContain("step_type => 'map'");
      expect(sql[3]).toContain("ARRAY['square']");
    });
  });

  describe('parameter ordering', () => {
    it('should place step_type after runtime options', () => {
      const flow = new Flow<string[]>({ slug: 'test_flow' })
        .map({
          slug: 'process',
          maxAttempts: 5,
          baseDelay: 10,
          timeout: 60,
          startDelay: 300
        }, (s) => s.length);

      const sql = compileFlow(flow);

      // Ensure step_type comes after all other options
      const expectedOrder =
        "SELECT pgflow.add_step('test_flow', 'process', " +
        "max_attempts => 5, base_delay => 10, timeout => 60, start_delay => 300, " +
        "step_type => 'map');";

      expect(sql[1]).toBe(expectedOrder);
    });

    it('should handle dependencies and step_type correctly', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test_flow' })
        .array({ slug: 'items' }, () => ['a', 'b'])
        .map({
          slug: 'process',
          array: 'items',
          maxAttempts: 3
        }, (s) => s.toUpperCase());

      const sql = compileFlow(flow);

      const expected =
        "SELECT pgflow.add_step('test_flow', 'process', ARRAY['items'], " +
        "max_attempts => 3, step_type => 'map');";

      expect(sql[2]).toBe(expected);
    });
  });
});