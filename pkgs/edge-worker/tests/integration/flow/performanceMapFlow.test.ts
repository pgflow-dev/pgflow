import { assert, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';
import {
  waitForRunCompletion,
  createRootMapFlow,
  getStepStates,
  getStepTasks,
  getRunOutput,
  assertAllStepsCompleted,
  monitorProgress,
} from './_testHelpers.ts';
import type { postgres } from '../../sql.ts';
import type { RunRow } from '@pgflow/core';

// Performance metrics collector
interface PerformanceMetrics {
  arraySize: number;
  startTime: number;
  flowStartTime: number;
  flowStartedTime: number; // When start_flow returns
  firstTaskPickupTime: number; // When first task is picked up
  flowEndTime: number;
  totalDuration: number;
  flowExecutionTime: number;
  flowStartupTime: number; // Time to start flow
  timeToFirstTask: number; // Time from start to first pickup
  tasksPerSecond: number;
  successfulTasks: number;
  failedTasks: number;
}

// Multi-flow performance metrics
interface MultiFlowMetrics {
  numFlows: number;
  numWorkers: number;
  totalElements: number;
  overallStartTime: number;
  overallEndTime: number;
  overallDuration: number;
  individualFlowMetrics: PerformanceMetrics[];
  averageFlowStartupTime: number;
  averageTimeToFirstTask: number;
  totalTasksPerSecond: number;
  workerUtilization: number;
}

// Helper to format duration in human-readable format
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

// Helper to print performance report with tasteful emojis
const printPerformanceReport = (metrics: PerformanceMetrics) => {
  const separator = '─'.repeat(60);

  console.log(`\n${separator}`);
  console.log('📊 Performance Test Results');
  console.log(separator);

  console.log(`\n📈 Test Configuration:`);
  console.log(`   Array Size: ${metrics.arraySize.toLocaleString()} elements`);

  console.log(`\n⏱️  Timing Breakdown:`);
  console.log(`   Total Duration: ${formatDuration(metrics.totalDuration)}`);
  console.log(
    `   Flow Execution: ${formatDuration(metrics.flowExecutionTime)}`
  );
  console.log(
    `   Setup Overhead: ${formatDuration(
      metrics.flowStartTime - metrics.startTime
    )}`
  );

  console.log(`\n🎯 Critical Metrics:`);
  console.log(
    `   Flow Startup Time: ${formatDuration(metrics.flowStartupTime)}`
  );
  console.log(
    `   Time to First Task: ${formatDuration(metrics.timeToFirstTask)}`
  );
  console.log(`   Tasks/Second: ${metrics.tasksPerSecond.toFixed(2)}`);
  console.log(
    `   Avg Task Time: ${(
      metrics.flowExecutionTime / metrics.arraySize
    ).toFixed(2)}ms`
  );

  console.log(`\n✅ Results:`);
  console.log(`   Successful: ${metrics.successfulTasks.toLocaleString()}`);
  console.log(`   Failed: ${metrics.failedTasks}`);

  // Performance rating based on tasks per second
  const rating =
    metrics.tasksPerSecond > 100
      ? '🏆 Excellent!'
      : metrics.tasksPerSecond > 50
      ? '👍 Good'
      : metrics.tasksPerSecond > 20
      ? '📌 Acceptable'
      : '⚠️  Needs Optimization';

  // Startup performance rating
  const startupRating =
    metrics.timeToFirstTask < 100
      ? '⚡ Very Fast'
      : metrics.timeToFirstTask < 500
      ? '✨ Fast'
      : metrics.timeToFirstTask < 1000
      ? '👌 Normal'
      : '🐌 Slow';

  console.log(`\n${separator}`);
  console.log(`Performance Rating: ${rating}`);
  console.log(`Startup Speed: ${startupRating}`);
  console.log(`${separator}\n`);
};

// Define a flow that processes a large array of strings
const LargeArrayMapFlow = new Flow<string[]>({
  slug: 'test_large_array_map_flow',
}).map({ slug: 'processString' }, async (str) => {
  // Simulate some string processing work
  await delay(Math.random() * 10); // Random delay 0-10ms to simulate variable processing time

  // Transform the string (simple uppercase + length calculation)
  return {
    original: str,
    uppercase: str.toUpperCase(),
    length: str.length,
    reversed: str.split('').reverse().join(''),
  };
});

// Helper to generate test data
const generateTestStrings = (
  count: number,
  flowIndex: number = 0
): string[] => {
  const words = [
    'alpha',
    'beta',
    'gamma',
    'delta',
    'epsilon',
    'zeta',
    'eta',
    'theta',
    'iota',
    'kappa',
  ];
  const strings: string[] = [];

  for (let i = 0; i < count; i++) {
    // Generate varied strings to test different processing times
    const word = words[i % words.length];
    const suffix = Math.floor(i / words.length)
      .toString()
      .padStart(4, '0');
    strings.push(`flow${flowIndex}_${word}_${suffix}`);
  }

  return strings;
};

// Helper to start a single flow and track its metrics
const startFlowWithMetrics = async (
  sql: postgres.Sql,
  flow: typeof LargeArrayMapFlow,
  testData: string[],
  _flowIndex: number
): Promise<{ flowRun: RunRow; metrics: PerformanceMetrics }> => {
  const metrics: PerformanceMetrics = {
    arraySize: testData.length,
    startTime: Date.now(),
    flowStartTime: 0,
    flowStartedTime: 0,
    firstTaskPickupTime: 0,
    flowEndTime: 0,
    totalDuration: 0,
    flowExecutionTime: 0,
    flowStartupTime: 0,
    timeToFirstTask: 0,
    tasksPerSecond: 0,
    successfulTasks: 0,
    failedTasks: 0,
  };

  // Measure flow startup time
  metrics.flowStartTime = Date.now();
  const flowRun = await startFlow(sql, flow, testData);
  metrics.flowStartedTime = Date.now();
  metrics.flowStartupTime = metrics.flowStartedTime - metrics.flowStartTime;

  return { flowRun, metrics };
};

// Helper to monitor first task pickup
const monitorFirstTaskPickup = async (
  sql: postgres.Sql,
  runId: string,
  metrics: PerformanceMetrics
): Promise<void> => {
  // Poll for first task pickup
  let pollAttempts = 0;
  while (!metrics.firstTaskPickupTime && pollAttempts < 50) {
    const result = await sql`
      SELECT MIN(started_at) as first_task_time
      FROM pgflow.step_tasks
      WHERE run_id = ${runId}
        AND started_at IS NOT NULL
    `;
    if (result[0].first_task_time) {
      metrics.firstTaskPickupTime = new Date(
        result[0].first_task_time
      ).getTime();
      metrics.timeToFirstTask =
        metrics.firstTaskPickupTime - metrics.flowStartedTime;
      break;
    }
    await delay(100);
    pollAttempts++;
  }
};

// Helper to collect final metrics for a flow
const collectFlowMetrics = async (
  sql: postgres.Sql,
  flowRun: RunRow,
  metrics: PerformanceMetrics
): Promise<void> => {
  metrics.flowEndTime = Date.now();
  metrics.totalDuration = metrics.flowEndTime - metrics.startTime;
  metrics.flowExecutionTime = metrics.flowEndTime - metrics.flowStartTime;
  metrics.tasksPerSecond =
    metrics.arraySize / (metrics.flowExecutionTime / 1000);

  // Get task completion stats
  const stepTasks = await getStepTasks(sql, flowRun.run_id);
  metrics.successfulTasks = stepTasks.filter(
    (t) => t.status === 'completed'
  ).length;
  metrics.failedTasks = stepTasks.filter((t) => t.status === 'failed').length;
};

// Helper to start multiple workers
interface WorkerConfig {
  maxConcurrent: number;
  [key: string]: unknown;
}

const startWorkers = (
  sql: postgres.Sql,
  flow: typeof LargeArrayMapFlow,
  numWorkers: number,
  config: WorkerConfig
) => {
  const workers = [];

  for (let i = 0; i < numWorkers; i++) {
    const worker = startWorker(sql, flow, {
      ...config,
      // Add slight variation to worker configs to simulate real-world
      maxConcurrent: config.maxConcurrent + (i % 2) * 5,
    });
    workers.push(worker);
  }

  return workers;
};

// Helper to print multi-flow performance report
const printMultiFlowReport = (metrics: MultiFlowMetrics) => {
  const separator = '═'.repeat(60);

  console.log(`\n${separator}`);
  console.log('📊 Multi-Flow Performance Test Results');
  console.log(separator);

  console.log(`\n🔄 Test Configuration:`);
  console.log(`   Concurrent Flows: ${metrics.numFlows}`);
  console.log(`   Worker Instances: ${metrics.numWorkers}`);
  console.log(`   Total Elements: ${metrics.totalElements.toLocaleString()}`);

  console.log(`\n⏱️  Overall Timing:`);
  console.log(`   Total Duration: ${formatDuration(metrics.overallDuration)}`);
  console.log(
    `   Avg Flow Startup: ${formatDuration(metrics.averageFlowStartupTime)}`
  );
  console.log(
    `   Avg Time to First Task: ${formatDuration(
      metrics.averageTimeToFirstTask
    )}`
  );

  console.log(`\n🚀 Throughput:`);
  console.log(
    `   Combined Tasks/Second: ${metrics.totalTasksPerSecond.toFixed(2)}`
  );
  console.log(
    `   Tasks per Worker/Second: ${(
      metrics.totalTasksPerSecond / metrics.numWorkers
    ).toFixed(2)}`
  );

  console.log(`\n📈 Individual Flow Stats:`);
  metrics.individualFlowMetrics.forEach((flow, i) => {
    console.log(
      `   Flow ${i + 1}: ${flow.successfulTasks}/${
        flow.arraySize
      } tasks, ${formatDuration(flow.flowExecutionTime)}`
    );
  });

  console.log(`\n${separator}\n`);
};

// Multi-flow/multi-worker test
Deno.test(
  'multi-flow multi-worker performance test - 10 flows, 4 workers',
  {
    sanitizeOps: false,
    sanitizeResources: false,
  },
  withPgNoTransaction(async (sql) => {
    // Save console methods for later restoration
    const originalLog = console.log;
    const originalDebug = console.debug;

    await sql`select pgflow_tests.reset_db();`;

    // Suppress verbose worker output during test
    console.log = () => {};
    console.debug = () => {};

    // Configuration
    const NUM_FLOWS = 100;
    const NUM_WORKERS = 4;
    const ELEMENTS_PER_FLOW = 100;

    const workers = startWorkers(sql, LargeArrayMapFlow, NUM_WORKERS, {
      maxConcurrent: 25,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 50,
    });

    try {
      // Restore console for our status messages
      console.log = originalLog;

      console.log('\n🔧 Setting up multi-flow performance test...');
      await createRootMapFlow(
        sql,
        'test_large_array_map_flow',
        'processString'
      );

      console.log(
        `📝 Starting ${NUM_FLOWS} flows with ${ELEMENTS_PER_FLOW} elements each...`
      );
      console.log(`👷 Running with ${NUM_WORKERS} workers...`);

      const multiMetrics: MultiFlowMetrics = {
        numFlows: NUM_FLOWS,
        numWorkers: NUM_WORKERS,
        totalElements: NUM_FLOWS * ELEMENTS_PER_FLOW,
        overallStartTime: Date.now(),
        overallEndTime: 0,
        overallDuration: 0,
        individualFlowMetrics: [],
        averageFlowStartupTime: 0,
        averageTimeToFirstTask: 0,
        totalTasksPerSecond: 0,
        workerUtilization: 0,
      };

      // Suppress output during execution
      console.log = () => {};

      // Start all flows concurrently
      const flowPromises = [];
      for (let i = 0; i < NUM_FLOWS; i++) {
        const testData = generateTestStrings(ELEMENTS_PER_FLOW, i);
        flowPromises.push(
          startFlowWithMetrics(sql, LargeArrayMapFlow, testData, i)
        );
      }

      const flowResults = await Promise.all(flowPromises);

      // Monitor first task pickup for all flows
      const monitorPromises = flowResults.map(({ flowRun, metrics }) =>
        monitorFirstTaskPickup(sql, flowRun.run_id, metrics)
      );
      await Promise.all(monitorPromises);

      // Wait for all flows to complete
      const completionPromises = flowResults.map(
        async ({ flowRun, metrics }) => {
          await waitForRunCompletion(sql, flowRun.run_id);
          await collectFlowMetrics(sql, flowRun, metrics);
          return metrics;
        }
      );

      multiMetrics.individualFlowMetrics = await Promise.all(
        completionPromises
      );
      multiMetrics.overallEndTime = Date.now();
      multiMetrics.overallDuration =
        multiMetrics.overallEndTime - multiMetrics.overallStartTime;

      // Calculate aggregated metrics
      multiMetrics.averageFlowStartupTime =
        multiMetrics.individualFlowMetrics.reduce(
          (sum, m) => sum + m.flowStartupTime,
          0
        ) / NUM_FLOWS;
      multiMetrics.averageTimeToFirstTask =
        multiMetrics.individualFlowMetrics.reduce(
          (sum, m) => sum + m.timeToFirstTask,
          0
        ) / NUM_FLOWS;
      multiMetrics.totalTasksPerSecond =
        multiMetrics.totalElements / (multiMetrics.overallDuration / 1000);

      // Restore console for results
      console.log = originalLog;

      // Print report
      printMultiFlowReport(multiMetrics);

      // Assertions
      const totalSuccessful = multiMetrics.individualFlowMetrics.reduce(
        (sum, m) => sum + m.successfulTasks,
        0
      );
      assertEquals(
        totalSuccessful,
        multiMetrics.totalElements,
        'All tasks should complete'
      );

      assert(
        multiMetrics.totalTasksPerSecond > 50,
        `Multi-flow throughput too low: ${multiMetrics.totalTasksPerSecond.toFixed(
          2
        )} tasks/sec`
      );
    } finally {
      // Restore console
      console.log = originalLog;
      console.debug = originalDebug;

      // Stop all workers
      await Promise.all(workers.map((w) => w.stop()));
    }
  })
);

// Original single-flow test (renamed for clarity)
Deno.test(
  'single-flow performance test - 1000 elements',
  {
    // Increase timeout for performance test (3 minutes should be plenty)
    sanitizeOps: false,
    sanitizeResources: false,
  },
  withPgNoTransaction(async (sql) => {
    // Save console methods for later restoration
    const originalLog = console.log;
    const originalDebug = console.debug;

    const metrics: PerformanceMetrics = {
      arraySize: 1000,
      startTime: Date.now(),
      flowStartTime: 0,
      flowStartedTime: 0,
      firstTaskPickupTime: 0,
      flowEndTime: 0,
      totalDuration: 0,
      flowExecutionTime: 0,
      flowStartupTime: 0,
      timeToFirstTask: 0,
      tasksPerSecond: 0,
      successfulTasks: 0,
      failedTasks: 0,
    };

    await sql`select pgflow_tests.reset_db();`;

    // Suppress verbose worker output during test
    console.log = () => {};
    console.debug = () => {};

    const worker = startWorker(sql, LargeArrayMapFlow, {
      maxConcurrent: 50, // Higher concurrency for performance test
      batchSize: 25, // Larger batch size for better throughput
      maxPollSeconds: 1,
      pollIntervalMs: 100, // Faster polling for performance
    });

    try {
      // Restore console for our status messages
      console.log = originalLog;

      // Setup: Create flow with root map step
      console.log('\n🔧 Setting up performance test...');
      await createRootMapFlow(
        sql,
        'test_large_array_map_flow',
        'processString'
      );

      // Generate test data
      console.log(`📝 Generating ${metrics.arraySize} test strings...`);
      const testData = generateTestStrings(metrics.arraySize);

      // Execute: Start flow with large array
      console.log(`🚀 Starting flow with ${metrics.arraySize} elements...`);

      // Suppress verbose output during execution
      console.log = () => {};

      // Measure flow startup time
      metrics.flowStartTime = Date.now();
      const flowRun = await startFlow(sql, LargeArrayMapFlow, testData);
      metrics.flowStartedTime = Date.now();
      metrics.flowStartupTime = metrics.flowStartedTime - metrics.flowStartTime;

      // Restore console for progress display
      console.log = originalLog;

      // Poll for first task pickup
      const firstTaskResult = await sql`
        SELECT MIN(started_at) as first_task_time
        FROM pgflow.step_tasks
        WHERE run_id = ${flowRun.run_id}
          AND started_at IS NOT NULL
      `;

      // Keep polling until we get the first task or timeout
      let pollAttempts = 0;
      while (!firstTaskResult[0].first_task_time && pollAttempts < 50) {
        await delay(100);
        const result = await sql`
          SELECT MIN(started_at) as first_task_time
          FROM pgflow.step_tasks
          WHERE run_id = ${flowRun.run_id}
            AND started_at IS NOT NULL
        `;
        if (result[0].first_task_time) {
          metrics.firstTaskPickupTime = new Date(
            result[0].first_task_time
          ).getTime();
          metrics.timeToFirstTask =
            metrics.firstTaskPickupTime - metrics.flowStartedTime;
          break;
        }
        pollAttempts++;
      }

      // Suppress verbose output again during polling
      console.log = () => {};

      // Start progress monitoring and wait for completion in parallel
      const [polledRun] = await Promise.all([
        waitForRunCompletion(sql, flowRun.run_id, { timeoutMs: 180000 }),
        monitorProgress(sql, flowRun.run_id, metrics.arraySize),
      ]);
      metrics.flowEndTime = Date.now();

      // Restore console for results
      console.log = originalLog;

      // Calculate timing metrics
      metrics.totalDuration = metrics.flowEndTime - metrics.startTime;
      metrics.flowExecutionTime = metrics.flowEndTime - metrics.flowStartTime;
      metrics.tasksPerSecond =
        metrics.arraySize / (metrics.flowExecutionTime / 1000);

      // If we didn't get first task time in the loop, try one more time
      if (!metrics.firstTaskPickupTime) {
        const finalCheck = await sql`
          SELECT MIN(started_at) as first_task_time
          FROM pgflow.step_tasks
          WHERE run_id = ${flowRun.run_id}
            AND started_at IS NOT NULL
        `;
        if (finalCheck[0].first_task_time) {
          metrics.firstTaskPickupTime = new Date(
            finalCheck[0].first_task_time
          ).getTime();
          metrics.timeToFirstTask =
            metrics.firstTaskPickupTime - metrics.flowStartedTime;
        }
      }

      // Verify: Run completed successfully
      assert(polledRun.status === 'completed', 'Run should be completed');

      // Verify: Step states
      const stepStates = await getStepStates(sql, flowRun.run_id);
      assertEquals(stepStates.length, 1, 'Should have 1 step state');
      assertAllStepsCompleted(stepStates);

      // Get detailed task information
      const stepTasks = await getStepTasks(sql, flowRun.run_id);
      assertEquals(
        stepTasks.length,
        metrics.arraySize,
        `Should have ${metrics.arraySize} tasks`
      );

      // Count successful vs failed tasks
      metrics.successfulTasks = stepTasks.filter(
        (t) => t.status === 'completed'
      ).length;
      metrics.failedTasks = stepTasks.filter(
        (t) => t.status === 'failed'
      ).length;

      // Verify all tasks completed successfully
      assertEquals(
        metrics.successfulTasks,
        metrics.arraySize,
        'All tasks should complete successfully'
      );
      assertEquals(metrics.failedTasks, 0, 'No tasks should fail');

      // Sample verification - check a few outputs to ensure correctness
      const sampleTask = stepTasks[0];
      assert(sampleTask.output !== null, 'Task should have output');

      // Type assertion for the output structure
      const output = sampleTask.output as Record<string, unknown>;
      assert('original' in output, 'Output should have original field');
      assert('uppercase' in output, 'Output should have uppercase field');
      assert('length' in output, 'Output should have length field');
      assert('reversed' in output, 'Output should have reversed field');

      // Verify: Final aggregated output exists and has correct structure
      const finalRun = await getRunOutput(sql, flowRun.run_id);
      assertEquals(finalRun.status, 'completed', 'Run should be completed');
      assert(finalRun.output !== null, 'Run should have output');

      // The output should have processString key with array of results
      const runOutput = finalRun.output as Record<string, unknown[]>;
      assert(
        'processString' in runOutput,
        'Output should have processString key'
      );
      assert(
        Array.isArray(runOutput.processString),
        'processString should be an array'
      );
      assertEquals(
        runOutput.processString.length,
        metrics.arraySize,
        'Should have all results'
      );

      // Print performance report
      printPerformanceReport(metrics);

      // Performance assertions (adjust thresholds based on your requirements)
      assert(
        metrics.tasksPerSecond > 10,
        `Performance too low: ${metrics.tasksPerSecond.toFixed(
          2
        )} tasks/sec (minimum: 10)`
      );

      assert(
        metrics.flowExecutionTime < 120000,
        `Execution took too long: ${formatDuration(
          metrics.flowExecutionTime
        )} (maximum: 2 minutes)`
      );
    } finally {
      // Restore console
      console.log = originalLog;
      console.debug = originalDebug;
      await worker.stop();
    }
  })
);

// Additional test with even larger array (optional - can be enabled for stress testing)
Deno.test(
  'large array map stress test - 5000 elements',
  {
    sanitizeOps: false,
    sanitizeResources: false,
  },
  withPgNoTransaction(async (sql) => {
    // Save console methods for later restoration
    const originalLog = console.log;
    const originalDebug = console.debug;

    const metrics: PerformanceMetrics = {
      arraySize: 5000,
      startTime: Date.now(),
      flowStartTime: 0,
      flowStartedTime: 0,
      firstTaskPickupTime: 0,
      flowEndTime: 0,
      totalDuration: 0,
      flowExecutionTime: 0,
      flowStartupTime: 0,
      timeToFirstTask: 0,
      tasksPerSecond: 0,
      successfulTasks: 0,
      failedTasks: 0,
    };

    await sql`select pgflow_tests.reset_db();`;

    // Suppress verbose output
    console.log = () => {};
    console.debug = () => {};

    const worker = startWorker(sql, LargeArrayMapFlow, {
      maxConcurrent: 100, // Even higher concurrency for stress test
      batchSize: 50,
      maxPollSeconds: 2,
      pollIntervalMs: 50,
    });

    try {
      await createRootMapFlow(
        sql,
        'test_large_array_map_flow',
        'processString'
      );

      const testData = generateTestStrings(metrics.arraySize);

      // Restore console for status message
      console.log = originalLog;
      console.log(
        `\n🔥 Stress test: Starting flow with ${metrics.arraySize} elements...`
      );

      // Suppress verbose output during execution
      console.log = () => {};

      // Measure flow startup time
      metrics.flowStartTime = Date.now();
      const flowRun = await startFlow(sql, LargeArrayMapFlow, testData);
      metrics.flowStartedTime = Date.now();
      metrics.flowStartupTime = metrics.flowStartedTime - metrics.flowStartTime;

      // Restore console for progress display
      console.log = originalLog;

      // Suppress verbose output again during polling
      console.log = () => {};

      // Start progress monitoring and wait for completion in parallel
      const [polledRun] = await Promise.all([
        waitForRunCompletion(sql, flowRun.run_id, {
          timeoutMs: 300000, // 5 minutes
          pollIntervalMs: 1000, // Poll every second
        }),
        monitorProgress(sql, flowRun.run_id, metrics.arraySize),
      ]);
      metrics.flowEndTime = Date.now();

      // Restore console for results
      console.log = originalLog;

      metrics.totalDuration = metrics.flowEndTime - metrics.startTime;
      metrics.flowExecutionTime = metrics.flowEndTime - metrics.flowStartTime;
      metrics.tasksPerSecond =
        metrics.arraySize / (metrics.flowExecutionTime / 1000);

      assert(
        polledRun.status === 'completed',
        'Stress test run should complete'
      );

      const stepTasks = await getStepTasks(sql, flowRun.run_id);
      metrics.successfulTasks = stepTasks.filter(
        (t) => t.status === 'completed'
      ).length;
      metrics.failedTasks = stepTasks.filter(
        (t) => t.status === 'failed'
      ).length;

      printPerformanceReport(metrics);
    } finally {
      // Restore console
      console.log = originalLog;
      console.debug = originalDebug;
      await worker.stop();
    }
  })
);
