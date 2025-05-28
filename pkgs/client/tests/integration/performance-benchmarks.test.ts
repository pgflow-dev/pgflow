import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types.js';
import { PgflowSqlClient } from '../../../core/src/PgflowSqlClient.js';

describe('Performance Benchmarks', () => {
  it(
    'handles high-frequency step completions (50+ completions per second)',
    withPgNoTransaction(async (sql) => {
      await grantMinimalPgflowPermissions(sql);

      const testFlow = createTestFlow('high_frequency_flow');
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      
      // Create 20 independent steps for parallel completion
      const stepCount = 20;
      for (let i = 0; i < stepCount; i++) {
        await sql`SELECT pgflow.add_step(${testFlow.slug}, ${`step_${i}`})`;
      }

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      console.log('=== Starting high-frequency completion test ===');
      const startTime = Date.now();

      const input = { data: 'high-frequency-test' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Give subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get all tasks
      const tasks = await sqlClient.pollForTasks(testFlow.slug, stepCount, 5, 200, 30);
      expect(tasks).toHaveLength(stepCount);

      const completionStartTime = Date.now();

      // Complete all tasks as quickly as possible
      const completionPromises = tasks.map((task, index) => 
        sqlClient.completeTask(task, { 
          result: `step-${index}-completed`,
          timestamp: Date.now()
        })
      );

      await Promise.all(completionPromises);

      const completionEndTime = Date.now();
      const completionDuration = completionEndTime - completionStartTime;

      // Wait for run completion
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 15000 });

      const totalDuration = Date.now() - startTime;
      const completionsPerSecond = (stepCount / completionDuration) * 1000;

      console.log(`=== Performance Results ===`);
      console.log(`Steps completed: ${stepCount}`);
      console.log(`Completion duration: ${completionDuration}ms`);
      console.log(`Total duration: ${totalDuration}ms`);
      console.log(`Completions per second: ${completionsPerSecond.toFixed(2)}`);

      // Verify all steps completed correctly
      expect(run.status).toBe(FlowRunStatus.Completed);
      for (let i = 0; i < stepCount; i++) {
        const step = run.step(`step_${i}`);
        expect(step.status).toBe(FlowStepStatus.Completed);
        expect(step.output.result).toBe(`step-${i}-completed`);
      }

      // Performance assertion - should complete at least 10 per second
      expect(completionsPerSecond).toBeGreaterThan(10);

      await supabaseClient.removeAllChannels();
    }),
    45000
  );

  it(
    'manages large DAG with many steps (25+ steps)',
    withPgNoTransaction(async (sql) => {
      await grantMinimalPgflowPermissions(sql);

      const testFlow = createTestFlow('large_dag_flow');
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;

      console.log('=== Creating large DAG (30 steps) ===');
      
      // Create a 30-step DAG with dependencies
      // Structure: 5 parallel roots -> 20 middle steps -> 5 final steps
      const stepCount = 30;
      
      // Root steps (0-4) - no dependencies
      for (let i = 0; i < 5; i++) {
        await sql`SELECT pgflow.add_step(${testFlow.slug}, ${`root_${i}`})`;
      }

      // Middle steps (5-24) - each depends on one root step
      for (let i = 5; i < 25; i++) {
        const rootDep = Math.floor((i - 5) / 4); // Distribute across roots
        await sql`SELECT pgflow.add_step(${testFlow.slug}, ${`middle_${i}`}, ARRAY[${`root_${rootDep}`}])`;
      }

      // Final steps (25-29) - each depends on multiple middle steps
      for (let i = 25; i < 30; i++) {
        const deps = [`middle_${i - 5}`, `middle_${i - 4}`, `middle_${i - 3}`];
        await sql`SELECT pgflow.add_step(${testFlow.slug}, ${`final_${i}`}, ARRAY[${deps}])`;
      }

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      console.log('=== Starting large DAG execution ===');
      const startTime = Date.now();

      const input = { data: 'large-dag-test' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Give subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 300));

      let completedSteps = 0;
      const stepTimes: Record<string, number> = {};

      // Execute DAG in waves based on dependencies
      console.log('=== Wave 1: Root steps ===');
      let tasks = await sqlClient.pollForTasks(testFlow.slug, 10, 5, 200, 30);
      expect(tasks.length).toBe(5); // 5 root steps should be available

      for (const task of tasks) {
        const stepStartTime = Date.now();
        await sqlClient.completeTask(task, { 
          result: `${task.step_slug}-completed`,
          wave: 1
        });
        stepTimes[task.step_slug] = Date.now() - stepStartTime;
        completedSteps++;
      }

      // Wait for root steps to complete
      for (let i = 0; i < 5; i++) {
        await run.step(`root_${i}`).waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
      }

      console.log('=== Wave 2: Middle steps ===');
      tasks = await sqlClient.pollForTasks(testFlow.slug, 25, 5, 200, 30);
      expect(tasks.length).toBe(20); // 20 middle steps should now be available

      // Complete middle steps in batches
      const batchSize = 5;
      for (let batch = 0; batch < tasks.length; batch += batchSize) {
        const batchTasks = tasks.slice(batch, batch + batchSize);
        const batchPromises = batchTasks.map(async (task) => {
          const stepStartTime = Date.now();
          await sqlClient.completeTask(task, { 
            result: `${task.step_slug}-completed`,
            wave: 2
          });
          stepTimes[task.step_slug] = Date.now() - stepStartTime;
          completedSteps++;
        });
        await Promise.all(batchPromises);
      }

      // Wait for middle steps to complete
      for (let i = 5; i < 25; i++) {
        await run.step(`middle_${i}`).waitForStatus(FlowStepStatus.Completed, { timeoutMs: 10000 });
      }

      console.log('=== Wave 3: Final steps ===');
      tasks = await sqlClient.pollForTasks(testFlow.slug, 10, 5, 200, 30);
      expect(tasks.length).toBe(5); // 5 final steps should now be available

      for (const task of tasks) {
        const stepStartTime = Date.now();
        await sqlClient.completeTask(task, { 
          result: `${task.step_slug}-completed`,
          wave: 3
        });
        stepTimes[task.step_slug] = Date.now() - stepStartTime;
        completedSteps++;
      }

      // Wait for final completion
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 15000 });

      const totalDuration = Date.now() - startTime;
      const avgStepTime = Object.values(stepTimes).reduce((a, b) => a + b, 0) / stepCount;

      console.log(`=== Large DAG Performance Results ===`);
      console.log(`Total steps: ${stepCount}`);
      console.log(`Completed steps: ${completedSteps}`);
      console.log(`Total execution time: ${totalDuration}ms`);
      console.log(`Average step completion time: ${avgStepTime.toFixed(2)}ms`);
      console.log(`Steps per second: ${(stepCount / totalDuration * 1000).toFixed(2)}`);

      // Verify all steps completed
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(completedSteps).toBe(stepCount);

      // Performance assertions
      expect(totalDuration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(avgStepTime).toBeLessThan(1000); // Average step should complete within 1 second

      await supabaseClient.removeAllChannels();
    }),
    60000
  );

  it(
    'sustains concurrent operations (10+ flows)',
    withPgNoTransaction(async (sql) => {
      await grantMinimalPgflowPermissions(sql);

      const flowCount = 12;
      const stepsPerFlow = 3;
      
      console.log(`=== Creating ${flowCount} flows with ${stepsPerFlow} steps each ===`);

      // Create multiple flows
      const flows: string[] = [];
      for (let i = 0; i < flowCount; i++) {
        const flowSlug = `concurrent_perf_flow_${i}`;
        flows.push(flowSlug);
        
        await sql`SELECT pgflow.create_flow(${flowSlug})`;
        for (let j = 0; j < stepsPerFlow; j++) {
          await sql`SELECT pgflow.add_step(${flowSlug}, ${`step_${j}`})`;
        }
      }

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      console.log('=== Starting all flows concurrently ===');
      const startTime = Date.now();

      // Start all flows simultaneously
      const runPromises = flows.map((flowSlug, index) => 
        pgflowClient.startFlow(flowSlug, { flowIndex: index, data: 'concurrent-perf-test' })
      );

      const runs = await Promise.all(runPromises);
      expect(runs.length).toBe(flowCount);

      // Give subscriptions time to establish
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('=== Processing all tasks concurrently ===');
      const totalExpectedTasks = flowCount * stepsPerFlow;
      
      // Get all tasks from all flows
      const allTaskPromises = flows.map(flowSlug => 
        sqlClient.pollForTasks(flowSlug, stepsPerFlow, 5, 200, 30)
      );

      const allTaskResults = await Promise.all(allTaskPromises);
      const allTasks = allTaskResults.flat();
      
      expect(allTasks.length).toBe(totalExpectedTasks);

      const taskCompletionStartTime = Date.now();

      // Complete all tasks as quickly as possible
      const completionPromises = allTasks.map((task, index) => 
        sqlClient.completeTask(task, { 
          result: `task-${index}-completed`,
          timestamp: Date.now()
        })
      );

      await Promise.all(completionPromises);

      const taskCompletionEndTime = Date.now();

      // Wait for all flows to complete
      const flowCompletionPromises = runs.map(run => 
        run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 20000 })
      );

      await Promise.all(flowCompletionPromises);

      const totalDuration = Date.now() - startTime;
      const taskCompletionDuration = taskCompletionEndTime - taskCompletionStartTime;
      const tasksPerSecond = (totalExpectedTasks / taskCompletionDuration) * 1000;
      const flowsPerSecond = (flowCount / totalDuration) * 1000;

      console.log(`=== Concurrent Performance Results ===`);
      console.log(`Concurrent flows: ${flowCount}`);
      console.log(`Total tasks: ${totalExpectedTasks}`);
      console.log(`Task completion duration: ${taskCompletionDuration}ms`);
      console.log(`Total duration: ${totalDuration}ms`);
      console.log(`Tasks per second: ${tasksPerSecond.toFixed(2)}`);
      console.log(`Flows per second: ${flowsPerSecond.toFixed(2)}`);

      // Verify all flows completed successfully
      for (const run of runs) {
        expect(run.status).toBe(FlowRunStatus.Completed);
        for (let i = 0; i < stepsPerFlow; i++) {
          expect(run.step(`step_${i}`).status).toBe(FlowStepStatus.Completed);
        }
      }

      // Performance assertions
      expect(tasksPerSecond).toBeGreaterThan(5); // Should handle at least 5 tasks per second
      expect(totalDuration).toBeLessThan(45000); // Should complete within 45 seconds

      await supabaseClient.removeAllChannels();
    }),
    60000
  );

  it(
    'tracks memory usage under load',
    withPgNoTransaction(async (sql) => {
      await grantMinimalPgflowPermissions(sql);

      const testFlow = createTestFlow('memory_test_flow');
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'memory_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Measure memory usage over time
      const memorySnapshots: { time: number; usage: number }[] = [];
      
      const getMemoryUsage = () => {
        if (typeof process !== 'undefined' && process.memoryUsage) {
          return process.memoryUsage().heapUsed / 1024 / 1024; // MB
        }
        return 0; // Browser environment or unavailable
      };

      const initialMemory = getMemoryUsage();
      memorySnapshots.push({ time: 0, usage: initialMemory });

      console.log(`=== Initial memory usage: ${initialMemory.toFixed(2)} MB ===`);

      const runCount = 50;
      const runs: any[] = [];

      // Create multiple runs to stress test memory usage
      for (let i = 0; i < runCount; i++) {
        const run = await pgflowClient.startFlow(testFlow.slug, { 
          iteration: i,
          data: `memory-test-${i}`,
          largePayload: new Array(1000).fill(`data-${i}`) // Add some memory load
        });
        runs.push(run);

        // Take memory snapshot every 10 runs
        if (i % 10 === 9) {
          const currentMemory = getMemoryUsage();
          memorySnapshots.push({ 
            time: i + 1, 
            usage: currentMemory 
          });
          console.log(`Memory after ${i + 1} runs: ${currentMemory.toFixed(2)} MB`);
        }
      }

      // Give subscriptions time to establish
      await new Promise(resolve => setTimeout(resolve, 500));

      // Complete all runs rapidly
      const allTaskPromises: Promise<any>[] = [];
      
      for (let i = 0; i < runCount; i++) {
        const taskPromise = sqlClient.pollForTasks(testFlow.slug, 1, 5, 200, 30)
          .then(tasks => {
            if (tasks.length > 0) {
              return sqlClient.completeTask(tasks[0], { 
                result: `run-${i}-completed`,
                completedAt: Date.now()
              });
            }
          });
        allTaskPromises.push(taskPromise);
      }

      await Promise.all(allTaskPromises);

      // Wait for all runs to complete
      const completionPromises = runs.map(run => 
        run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 30000 })
      );

      await Promise.all(completionPromises);

      const finalMemory = getMemoryUsage();
      memorySnapshots.push({ time: runCount, usage: finalMemory });

      console.log(`=== Memory Usage Analysis ===`);
      console.log(`Initial memory: ${initialMemory.toFixed(2)} MB`);
      console.log(`Final memory: ${finalMemory.toFixed(2)} MB`);
      console.log(`Memory increase: ${(finalMemory - initialMemory).toFixed(2)} MB`);
      console.log(`Memory per run: ${((finalMemory - initialMemory) / runCount).toFixed(3)} MB`);

      // Log all snapshots
      memorySnapshots.forEach(snapshot => {
        console.log(`  ${snapshot.time} runs: ${snapshot.usage.toFixed(2)} MB`);
      });

      // Verify all runs completed
      expect(runs.length).toBe(runCount);
      for (const run of runs) {
        expect(run.status).toBe(FlowRunStatus.Completed);
      }

      // Memory assertions - should not grow excessively
      const memoryGrowth = finalMemory - initialMemory;
      expect(memoryGrowth).toBeLessThan(100); // Should not grow more than 100MB
      
      const memoryPerRun = memoryGrowth / runCount;
      expect(memoryPerRun).toBeLessThan(1); // Should not use more than 1MB per run on average

      await supabaseClient.removeAllChannels();
    }),
    90000
  );
});