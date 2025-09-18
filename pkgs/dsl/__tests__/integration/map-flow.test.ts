import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { compileFlow } from '../../src/compile-flow.js';

describe('Map flow integration tests', () => {
  describe('complete flow examples', () => {
    it('should compile a data processing pipeline with maps', () => {
      // Simulating a real-world data processing flow
      const flow = new Flow<string[]>({ slug: 'data_processing' })
        .map({ slug: 'normalize' }, (item) => item.trim().toLowerCase())
        .map({ slug: 'validate', array: 'normalize' }, (item) => {
          // Validate each normalized item
          return item.length > 0 && item.length < 100;
        })
        .step({ slug: 'summarize', dependsOn: ['validate'] }, (input) => ({
          total: input.validate.length,
          valid: input.validate.filter(v => v).length,
          invalid: input.validate.filter(v => !v).length
        }));

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(4);
      expect(sql[0]).toBe("SELECT pgflow.create_flow('data_processing');");
      expect(sql[1]).toBe("SELECT pgflow.add_step('data_processing', 'normalize', step_type => 'map');");
      expect(sql[2]).toBe("SELECT pgflow.add_step('data_processing', 'validate', ARRAY['normalize'], step_type => 'map');");
      expect(sql[3]).toBe("SELECT pgflow.add_step('data_processing', 'summarize', ARRAY['validate']);");
    });

    it('should compile an ETL flow with array generation and mapping', () => {
      const flow = new Flow<{ sourceIds: string[] }>({ slug: 'etl_flow' })
        .array({ slug: 'fetch_data' }, async ({ run }) => {
          // Simulating fetching data for each source ID
          return run.sourceIds.map(id => ({ id, data: `data_${id}` }));
        })
        .map({ slug: 'transform', array: 'fetch_data' }, (record) => ({
          ...record,
          transformed: record.data.toUpperCase(),
          timestamp: Date.now()
        }))
        .map({ slug: 'enrich', array: 'transform' }, async (record) => ({
          ...record,
          enriched: true,
          metadata: { processedAt: new Date().toISOString() }
        }))
        .step({ slug: 'load', dependsOn: ['enrich'] }, async (input) => {
          // Final loading step
          return {
            recordsProcessed: input.enrich.length,
            success: true
          };
        });

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(5);
      expect(sql[1]).not.toContain("step_type"); // array step
      expect(sql[2]).toContain("step_type => 'map'");
      expect(sql[3]).toContain("step_type => 'map'");
      expect(sql[4]).not.toContain("step_type"); // regular step
    });

    it('should handle complex nested array processing', () => {
      // Flow that processes nested arrays (e.g., matrix operations)
      const flow = new Flow<number[][]>({ slug: 'matrix_flow' })
        .map({ slug: 'row_sums' }, (row) => row.reduce((a, b) => a + b, 0))
        .step({ slug: 'total_sum', dependsOn: ['row_sums'] }, (input) =>
          input.row_sums.reduce((a, b) => a + b, 0)
        );

      const sql = compileFlow(flow);

      expect(sql).toHaveLength(3);
      expect(sql[1]).toBe("SELECT pgflow.add_step('matrix_flow', 'row_sums', step_type => 'map');");
      expect(sql[2]).toBe("SELECT pgflow.add_step('matrix_flow', 'total_sum', ARRAY['row_sums']);");
    });
  });

  describe('runtime validation', () => {
    it('should throw when trying to use non-existent step as array dependency', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test' })
        .step({ slug: 'exists' }, () => [1, 2, 3]);

      expect(() => {
        // @ts-expect-error - TypeScript should catch this at compile time
        flow.map({ slug: 'fail', array: 'doesNotExist' }, (item) => item);
      }).toThrow('Step "fail" depends on undefined step "doesNotExist"');
    });

    it('should throw when step slug already exists', () => {
      const flow = new Flow<number[]>({ slug: 'test' })
        .map({ slug: 'process' }, (n) => n * 2);

      expect(() => {
        flow.map({ slug: 'process' }, (n) => n * 3);
      }).toThrow('Step "process" already exists in flow "test"');
    });

    it('should validate slug format', () => {
      expect(() => {
        new Flow<number[]>({ slug: 'test' })
          .map({ slug: 'invalid-slug!' }, (n) => n);
      }).toThrow(); // validateSlug should reject invalid characters
    });

    it('should validate runtime options', () => {
      // This should not throw - valid options
      const validFlow = new Flow<number[]>({ slug: 'test' })
        .map({
          slug: 'valid',
          maxAttempts: 3,
          baseDelay: 1000,
          timeout: 30000,
          startDelay: 5000
        }, (n) => n);

      expect(compileFlow(validFlow)).toHaveLength(2);

      // Invalid options should be caught by validateRuntimeOptions
      expect(() => {
        new Flow<number[]>({ slug: 'test' })
          .map({
            slug: 'invalid',
            maxAttempts: 0 // Should be >= 1
          }, (n) => n);
      }).toThrow();
    });
  });

  describe('type inference validation', () => {
    it('should correctly infer types through map chains', () => {
      const flow = new Flow<{ items: string[] }>({ slug: 'test' })
        .step({ slug: 'extract', dependsOn: [] }, ({ run }) => run.items)
        .map({ slug: 'lengths', array: 'extract' }, (item) => item.length)
        .map({ slug: 'doubles', array: 'lengths' }, (len) => len * 2)
        .step({ slug: 'sum', dependsOn: ['doubles'] }, (input) => {
          // Type checking - this should compile without errors
          const total: number = input.doubles.reduce((a, b) => a + b, 0);
          return total;
        });

      const sql = compileFlow(flow);
      expect(sql).toHaveLength(5);
    });
  });

  describe('edge cases', () => {
    it('should handle empty array processing', () => {
      const flow = new Flow<Json[]>({ slug: 'empty_test' })
        .map({ slug: 'process' }, (item) => ({ processed: item }));

      const sql = compileFlow(flow);
      expect(sql).toHaveLength(2);
      expect(sql[1]).toContain("step_type => 'map'");
    });

    it('should handle all runtime options combinations', () => {
      const flow = new Flow<string[]>({ slug: 'options_test' })
        .map({ slug: 'no_options' }, (s) => s)
        .map({ slug: 'some_options', array: 'no_options', maxAttempts: 5 }, (s) => s)
        .map({
          slug: 'all_options',
          array: 'some_options',
          maxAttempts: 3,
          baseDelay: 1000,
          timeout: 30000,
          startDelay: 5000
        }, (s) => s);

      const sql = compileFlow(flow);

      expect(sql[1]).toBe("SELECT pgflow.add_step('options_test', 'no_options', step_type => 'map');");
      expect(sql[2]).toBe("SELECT pgflow.add_step('options_test', 'some_options', ARRAY['no_options'], max_attempts => 5, step_type => 'map');");
      expect(sql[3]).toContain("max_attempts => 3");
      expect(sql[3]).toContain("base_delay => 1000");
      expect(sql[3]).toContain("timeout => 30000");
      expect(sql[3]).toContain("start_delay => 5000");
      expect(sql[3]).toContain("step_type => 'map'");
    });

    it('should handle map steps with no further dependencies', () => {
      // Map step as a leaf node
      const flow = new Flow<number[]>({ slug: 'leaf_map' })
        .map({ slug: 'final_map' }, (n) => n * n);

      const sql = compileFlow(flow);
      expect(sql).toHaveLength(2);
      expect(sql[1]).toBe("SELECT pgflow.add_step('leaf_map', 'final_map', step_type => 'map');");
    });

    it('should handle multiple independent map chains', () => {
      const flow = new Flow<{ a: number[]; b: string[] }>({ slug: 'parallel' })
        .step({ slug: 'extract_a' }, ({ run }) => run.a)
        .step({ slug: 'extract_b' }, ({ run }) => run.b)
        .map({ slug: 'process_a', array: 'extract_a' }, (n) => n * 2)
        .map({ slug: 'process_b', array: 'extract_b' }, (s) => s.toUpperCase())
        .step({ slug: 'combine', dependsOn: ['process_a', 'process_b'] }, (input) => ({
          numbers: input.process_a,
          strings: input.process_b
        }));

      const sql = compileFlow(flow);
      expect(sql).toHaveLength(6);
      expect(sql[3]).toContain("step_type => 'map'");
      expect(sql[4]).toContain("step_type => 'map'");
    });
  });
});