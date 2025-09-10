import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';

describe('Array Integration Tests', () => {
  describe('end-to-end workflows with arrays', () => {
    it('should handle a complete data processing pipeline with arrays', async () => {
      type Input = { 
        userIds: number[];
        includeInactive: boolean;
      };

      const dataFlow = new Flow<Input>({ slug: 'user_processing_pipeline' })
        // Fetch user data as array
        .array({ slug: 'users' }, ({ run }) => 
          run.userIds.map(id => ({
            id,
            name: `User ${id}`,
            active: id % 2 === 1, // Odd IDs are active
            score: Math.floor(Math.random() * 100)
          }))
        )
        // Filter users based on criteria
        .array({ slug: 'filtered_users', dependsOn: ['users'] }, ({ users, run }) =>
          run.includeInactive 
            ? users 
            : users.filter(user => user.active)
        )
        // Calculate statistics from filtered users
        .step({ slug: 'stats', dependsOn: ['filtered_users'] }, ({ filtered_users }) => ({
          count: filtered_users.length,
          averageScore: filtered_users.length > 0 
            ? filtered_users.reduce((sum, user) => sum + user.score, 0) / filtered_users.length
            : 0,
          activeCount: filtered_users.filter(user => user.active).length
        }))
        // Generate reports array based on stats
        .array({ slug: 'reports', dependsOn: ['stats', 'filtered_users'] }, ({ stats, filtered_users }) => 
          filtered_users.map(user => ({
            userId: user.id,
            userName: user.name,
            score: user.score,
            percentile: stats.averageScore > 0 ? (user.score / stats.averageScore) * 100 : 0,
            isAboveAverage: user.score > stats.averageScore
          }))
        );

      // Test execution
      const input = { userIds: [1, 2, 3, 4, 5], includeInactive: false };

      // Execute each step
      const usersHandler = dataFlow.getStepDefinition('users').handler;
      const usersResult = await usersHandler({ run: input });

      const filteredHandler = dataFlow.getStepDefinition('filtered_users').handler;
      const filteredResult = await filteredHandler({ 
        run: input, 
        users: usersResult 
      });

      const statsHandler = dataFlow.getStepDefinition('stats').handler;
      const statsResult = await statsHandler({ 
        run: input, 
        filtered_users: filteredResult 
      });

      const reportsHandler = dataFlow.getStepDefinition('reports').handler;
      const reportsResult = await reportsHandler({ 
        run: input, 
        stats: statsResult,
        filtered_users: filteredResult
      });

      // Verify results
      expect(usersResult).toHaveLength(5);
      expect(filteredResult).toHaveLength(3); // Only odd IDs (1, 3, 5) are active
      expect(statsResult.count).toBe(3);
      expect(statsResult.activeCount).toBe(3);
      expect(reportsResult).toHaveLength(3);
      expect(reportsResult.every(report => report.isAboveAverage !== undefined)).toBe(true);
    });

    it('should handle multi-level array dependency chains', async () => {
      type Config = {
        levels: number;
        itemsPerLevel: number;
      };

      const pyramidFlow = new Flow<Config>({ slug: 'pyramid_builder' })
        // Generate base level items
        .array({ slug: 'level_0' }, ({ run }) =>
          Array(run.itemsPerLevel).fill(0).map((_, i) => ({
            id: i,
            level: 0,
            value: i + 1
          }))
        )
        // Build level 1 from level 0
        .array({ slug: 'level_1', dependsOn: ['level_0'] }, ({ level_0, run }) => {
          if (run.levels <= 1) return [];
          return level_0.map(item => ({
            id: item.id + 100,
            level: 1,
            value: item.value * 2,
            source: item.id
          }));
        })
        // Build level 2 from level 1
        .array({ slug: 'level_2', dependsOn: ['level_1'] }, ({ level_1, run }) => {
          if (run.levels <= 2) return [];
          return level_1.map(item => ({
            id: item.id + 100,
            level: 2,
            value: item.value * 2,
            source: item.source
          }));
        })
        // Aggregate all levels
        .step({ slug: 'summary', dependsOn: ['level_0', 'level_1', 'level_2'] }, 
          ({ level_0, level_1, level_2 }) => ({
            totalItems: level_0.length + level_1.length + level_2.length,
            totalValue: [
              ...level_0.map(item => item.value),
              ...level_1.map(item => item.value),
              ...level_2.map(item => item.value)
            ].reduce((sum, val) => sum + val, 0),
            levelCounts: {
              level0: level_0.length,
              level1: level_1.length,
              level2: level_2.length
            }
          })
        );

      // Test execution with 3 levels
      const input = { levels: 3, itemsPerLevel: 2 };

      const level0Handler = pyramidFlow.getStepDefinition('level_0').handler;
      const level0Result = await level0Handler({ run: input });

      const level1Handler = pyramidFlow.getStepDefinition('level_1').handler;
      const level1Result = await level1Handler({ run: input, level_0: level0Result });

      const level2Handler = pyramidFlow.getStepDefinition('level_2').handler;
      const level2Result = await level2Handler({ run: input, level_1: level1Result });

      const summaryHandler = pyramidFlow.getStepDefinition('summary').handler;
      const summaryResult = await summaryHandler({
        run: input,
        level_0: level0Result,
        level_1: level1Result,
        level_2: level2Result
      });

      // Verify pyramid structure
      expect(level0Result).toHaveLength(2);
      expect(level1Result).toHaveLength(2);
      expect(level2Result).toHaveLength(2);
      
      expect(level0Result[0]).toEqual({ id: 0, level: 0, value: 1 });
      expect(level1Result[0]).toEqual({ id: 100, level: 1, value: 2, source: 0 });
      expect(level2Result[0]).toEqual({ id: 200, level: 2, value: 4, source: 0 });

      expect(summaryResult.totalItems).toBe(6);
      expect(summaryResult.levelCounts).toEqual({
        level0: 2,
        level1: 2, 
        level2: 2
      });
    });

    it('should handle mixed array and regular step workflows', async () => {
      type Input = {
        dataSource: string;
        batchSize: number;
      };

      const processingFlow = new Flow<Input>({ slug: 'mixed_processing' })
        // Configuration step (regular)
        .step({ slug: 'config' }, ({ run }) => ({
          source: run.dataSource,
          maxItems: run.batchSize * 10,
          processingMode: run.batchSize > 100 ? 'parallel' : 'sequential'
        }))
        // Generate data array based on config
        .array({ slug: 'raw_data', dependsOn: ['config'] }, ({ config }) =>
          Array(Math.min(config.maxItems, 50)).fill(0).map((_, i) => ({
            id: i,
            source: config.source,
            data: `item_${i}`,
            timestamp: Date.now() + i
          }))
        )
        // Batch processing (regular step that groups array data)
        .step({ slug: 'batches', dependsOn: ['raw_data', 'config'] }, ({ raw_data, config, run }) => {
          const batches = [];
          for (let i = 0; i < raw_data.length; i += run.batchSize) {
            batches.push({
              id: Math.floor(i / run.batchSize),
              items: raw_data.slice(i, i + run.batchSize),
              mode: config.processingMode
            });
          }
          return { batches, count: batches.length };
        })
        // Process each batch into results array
        .array({ slug: 'processed_batches', dependsOn: ['batches'] }, ({ batches }) =>
          batches.batches.map(batch => ({
            batchId: batch.id,
            processedCount: batch.items.length,
            mode: batch.mode,
            results: batch.items.map(item => ({
              id: item.id,
              processed: true,
              result: `processed_${item.data}`
            }))
          }))
        )
        // Final summary (regular step)
        .step({ slug: 'final_summary', dependsOn: ['processed_batches', 'config'] }, 
          ({ processed_batches, config }) => ({
            totalBatches: processed_batches.length,
            totalProcessedItems: processed_batches.reduce(
              (sum, batch) => sum + batch.processedCount, 0
            ),
            processingMode: config.processingMode,
            allSuccessful: processed_batches.every(batch => 
              batch.results.every(result => result.processed)
            )
          })
        );

      // Test execution
      const input = { dataSource: 'test-db', batchSize: 5 };

      const configHandler = processingFlow.getStepDefinition('config').handler;
      const configResult = await configHandler({ run: input });

      const rawDataHandler = processingFlow.getStepDefinition('raw_data').handler;
      const rawDataResult = await rawDataHandler({ run: input, config: configResult });

      const batchesHandler = processingFlow.getStepDefinition('batches').handler;
      const batchesResult = await batchesHandler({ 
        run: input, 
        raw_data: rawDataResult, 
        config: configResult 
      });

      const processedHandler = processingFlow.getStepDefinition('processed_batches').handler;
      const processedResult = await processedHandler({ 
        run: input, 
        batches: batchesResult 
      });

      const summaryHandler = processingFlow.getStepDefinition('final_summary').handler;
      const summaryResult = await summaryHandler({ 
        run: input, 
        processed_batches: processedResult,
        config: configResult
      });

      // Verify mixed workflow results
      expect(configResult.processingMode).toBe('sequential'); // batchSize = 5 <= 100
      expect(rawDataResult).toHaveLength(50); // min(5 * 10, 50) = 50
      expect(batchesResult.count).toBe(10); // 50 items / 5 per batch = 10 batches
      expect(processedResult).toHaveLength(10);
      expect(summaryResult.totalBatches).toBe(10);
      expect(summaryResult.totalProcessedItems).toBe(50);
      expect(summaryResult.allSuccessful).toBe(true);
    });
  });

  describe('complex dependency scenarios', () => {
    it('should handle diamond dependency pattern with arrays', async () => {
      type Input = { base: number };

      const diamondFlow = new Flow<Input>({ slug: 'diamond_pattern' })
        // Root step
        .step({ slug: 'root' }, ({ run }) => ({ value: run.base, multiplier: 2 }))
        
        // Two parallel array branches from root
        .array({ slug: 'left_branch', dependsOn: ['root'] }, ({ root }) =>
          [root.value, root.value + 1, root.value + 2].map(val => ({ 
            value: val * root.multiplier,
            branch: 'left' 
          }))
        )
        .array({ slug: 'right_branch', dependsOn: ['root'] }, ({ root }) =>
          [root.value + 10, root.value + 20].map(val => ({ 
            value: val * root.multiplier,
            branch: 'right' 
          }))
        )
        
        // Merge both branches in final array step
        .array({ slug: 'merged', dependsOn: ['left_branch', 'right_branch'] }, 
          ({ left_branch, right_branch }) => [
            ...left_branch.map(item => ({ ...item, merged: true })),
            ...right_branch.map(item => ({ ...item, merged: true }))
          ]
        );

      const input = { base: 5 };

      const rootHandler = diamondFlow.getStepDefinition('root').handler;
      const rootResult = await rootHandler({ run: input });

      const leftHandler = diamondFlow.getStepDefinition('left_branch').handler;
      const leftResult = await leftHandler({ run: input, root: rootResult });

      const rightHandler = diamondFlow.getStepDefinition('right_branch').handler;
      const rightResult = await rightHandler({ run: input, root: rootResult });

      const mergedHandler = diamondFlow.getStepDefinition('merged').handler;
      const mergedResult = await mergedHandler({ 
        run: input,
        left_branch: leftResult,
        right_branch: rightResult
      });

      // Verify diamond pattern results
      expect(rootResult).toEqual({ value: 5, multiplier: 2 });
      expect(leftResult).toHaveLength(3);
      expect(rightResult).toHaveLength(2);
      expect(mergedResult).toHaveLength(5);

      expect(leftResult[0]).toEqual({ value: 10, branch: 'left' }); // (5 * 2)
      expect(rightResult[0]).toEqual({ value: 30, branch: 'right' }); // (15 * 2)
      
      expect(mergedResult.every(item => item.merged === true)).toBe(true);
      expect(mergedResult.filter(item => item.branch === 'left')).toHaveLength(3);
      expect(mergedResult.filter(item => item.branch === 'right')).toHaveLength(2);
    });

    it('should handle deep dependency chains with arrays', async () => {
      type Input = { seed: number };

      const chainFlow = new Flow<Input>({ slug: 'deep_chain' })
        .array({ slug: 'generation_1' }, ({ run }) => 
          Array(3).fill(0).map((_, i) => ({ 
            id: i, 
            generation: 1, 
            value: run.seed + i 
          }))
        )
        .array({ slug: 'generation_2', dependsOn: ['generation_1'] }, ({ generation_1 }) =>
          generation_1.flatMap(parent => 
            Array(2).fill(0).map((_, i) => ({
              id: parent.id * 2 + i,
              generation: 2,
              value: parent.value * 2 + i,
              parentId: parent.id
            }))
          )
        )
        .array({ slug: 'generation_3', dependsOn: ['generation_2'] }, ({ generation_2 }) =>
          generation_2.flatMap(parent => 
            Array(2).fill(0).map((_, i) => ({
              id: parent.id * 2 + i,
              generation: 3,
              value: parent.value + i + 1,
              parentId: parent.id,
              rootValue: Math.floor(parent.value / 4) // Trace back to root
            }))
          )
        )
        .step({ slug: 'lineage_analysis', dependsOn: ['generation_1', 'generation_2', 'generation_3'] }, 
          ({ generation_1, generation_2, generation_3 }) => ({
            totalNodes: generation_1.length + generation_2.length + generation_3.length,
            generationCounts: [generation_1.length, generation_2.length, generation_3.length],
            maxValue: Math.max(
              ...generation_1.map(n => n.value),
              ...generation_2.map(n => n.value),
              ...generation_3.map(n => n.value)
            ),
            leafNodes: generation_3.length
          })
        );

      const input = { seed: 10 };

      const gen1Handler = chainFlow.getStepDefinition('generation_1').handler;
      const gen1Result = await gen1Handler({ run: input });

      const gen2Handler = chainFlow.getStepDefinition('generation_2').handler;
      const gen2Result = await gen2Handler({ run: input, generation_1: gen1Result });

      const gen3Handler = chainFlow.getStepDefinition('generation_3').handler;
      const gen3Result = await gen3Handler({ run: input, generation_2: gen2Result });

      const analysisHandler = chainFlow.getStepDefinition('lineage_analysis').handler;
      const analysisResult = await analysisHandler({
        run: input,
        generation_1: gen1Result,
        generation_2: gen2Result,
        generation_3: gen3Result
      });

      // Verify deep chain results
      expect(gen1Result).toHaveLength(3); // 3 root nodes
      expect(gen2Result).toHaveLength(6); // 3 * 2 = 6 second generation
      expect(gen3Result).toHaveLength(12); // 6 * 2 = 12 third generation
      
      expect(analysisResult.totalNodes).toBe(21); // 3 + 6 + 12
      expect(analysisResult.generationCounts).toEqual([3, 6, 12]);
      expect(analysisResult.leafNodes).toBe(12);
      
      // Verify tree structure integrity
      expect(gen1Result[0]).toEqual({ id: 0, generation: 1, value: 10 });
      expect(gen2Result[0]).toEqual({ id: 0, generation: 2, value: 20, parentId: 0 });
      expect(gen3Result[0]).toEqual({ id: 0, generation: 3, value: 21, parentId: 0, rootValue: 5 });
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle empty arrays in dependency chains', async () => {
      type Input = { includeItems: boolean };

      const emptyFlow = new Flow<Input>({ slug: 'empty_handling' })
        .array({ slug: 'conditional_items' }, ({ run }) =>
          run.includeItems ? [1, 2, 3] : []
        )
        .array({ slug: 'processed_items', dependsOn: ['conditional_items'] }, ({ conditional_items }) =>
          conditional_items.map(item => ({ processed: item * 2 }))
        )
        .step({ slug: 'summary', dependsOn: ['processed_items'] }, ({ processed_items }) => ({
          count: processed_items.length,
          hasItems: processed_items.length > 0,
          total: processed_items.reduce((sum, item) => sum + item.processed, 0)
        }));

      // Test with empty array
      const emptyInput = { includeItems: false };
      
      const conditionalHandler = emptyFlow.getStepDefinition('conditional_items').handler;
      const conditionalResult = await conditionalHandler({ run: emptyInput });

      const processedHandler = emptyFlow.getStepDefinition('processed_items').handler;
      const processedResult = await processedHandler({ 
        run: emptyInput, 
        conditional_items: conditionalResult 
      });

      const summaryHandler = emptyFlow.getStepDefinition('summary').handler;
      const summaryResult = await summaryHandler({ 
        run: emptyInput, 
        processed_items: processedResult 
      });

      expect(conditionalResult).toEqual([]);
      expect(processedResult).toEqual([]);
      expect(summaryResult).toEqual({
        count: 0,
        hasItems: false,
        total: 0
      });
    });

    it('should handle async array operations in complex flows', async () => {
      type Input = { delays: number[] };

      const asyncFlow = new Flow<Input>({ slug: 'async_operations' })
        .array({ slug: 'async_data' }, async ({ run }) => {
          // Simulate async operations with different delays
          const promises = run.delays.map(async (delay, index) => {
            await new Promise(resolve => setTimeout(resolve, delay));
            return { id: index, delay, completed: Date.now() };
          });
          return Promise.all(promises);
        })
        .array({ slug: 'validated_data', dependsOn: ['async_data'] }, async ({ async_data }) => {
          // Simulate async validation
          await new Promise(resolve => setTimeout(resolve, 1));
          return async_data.filter(item => item.delay < 100).map(item => ({
            ...item,
            validated: true,
            validatedAt: Date.now()
          }));
        })
        .step({ slug: 'timing_analysis', dependsOn: ['validated_data'] }, ({ validated_data }) => ({
          validatedCount: validated_data.length,
          averageDelay: validated_data.length > 0
            ? validated_data.reduce((sum, item) => sum + item.delay, 0) / validated_data.length
            : 0,
          allValidated: validated_data.every(item => item.validated)
        }));

      const input = { delays: [10, 50, 150, 30] }; // 150ms will be filtered out
      
      const asyncHandler = asyncFlow.getStepDefinition('async_data').handler;
      const asyncResult = await asyncHandler({ run: input });

      const validatedHandler = asyncFlow.getStepDefinition('validated_data').handler;
      const validatedResult = await validatedHandler({ 
        run: input, 
        async_data: asyncResult 
      });

      const timingHandler = asyncFlow.getStepDefinition('timing_analysis').handler;
      const timingResult = await timingHandler({ 
        run: input, 
        validated_data: validatedResult 
      });

      expect(asyncResult).toHaveLength(4);
      expect(validatedResult).toHaveLength(3); // 150ms delay filtered out
      expect(timingResult.validatedCount).toBe(3);
      expect(timingResult.averageDelay).toBe(30); // (10 + 50 + 30) / 3
      expect(timingResult.allValidated).toBe(true);
      expect(validatedResult.every(item => item.validated === true)).toBe(true);
    });
  });
});