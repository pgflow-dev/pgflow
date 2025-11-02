#!/usr/bin/env node

/**
 * Performance Benchmark Script for pgflow Client
 * 
 * This script runs high-throughput performance tests similar to the integration tests
 * but with increased scale and detailed performance reporting.
 * 
 * Usage: pnpm run benchmark
 */

import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { PgflowClient, FlowRunStatus } from '../dist/index.js';
import { PgflowSqlClient } from '@pgflow/core';
import { performance } from 'perf_hooks';

// Configuration
const CONFIG = {
  // Scale up from the original 20 steps to much higher numbers
  STEP_COUNT: parseInt(process.env.STEP_COUNT || '100'), // 5x increase
  CONCURRENT_FLOWS: parseInt(process.env.CONCURRENT_FLOWS || '20'), // 2.5x increase
  STEPS_PER_FLOW: parseInt(process.env.STEPS_PER_FLOW || '5'),
  
  // Database settings - use same ports as integration tests
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:50522/postgres',
  SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:50521',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  
  // Timing settings
  COMPLETION_BATCH_SIZE: 10,
  MAX_COMPLETION_TIME_MS: 60000,
};

// Helper functions
function createTestFlow(flowSlug) {
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  return {
    slug: flowSlug ? `${flowSlug}_${uniqueSuffix}` : `perf_flow_${uniqueSuffix}`,
    options: {},
  };
}

function getMemoryUsage() {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed / 1024 / 1024; // MB
  }
  return 0;
}

async function grantMinimalPgflowPermissions(sql) {
  // Grant minimal permissions to service_role
  try { await sql`GRANT USAGE ON SCHEMA pgflow TO service_role`; } catch { /* ignore errors */ }
  try { await sql`GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO service_role`; } catch { /* ignore errors */ }
  try { await sql`GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO service_role`; } catch { /* ignore errors */ }
  try { await sql`GRANT SELECT ON TABLE pgflow.flows TO service_role`; } catch { /* ignore errors */ }
  try { await sql`GRANT SELECT ON TABLE pgflow.steps TO service_role`; } catch { /* ignore errors */ }
}

function formatNumber(num) {
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(num);
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

function printPerformanceStats(stats) {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 PERFORMANCE RESULTS: ${stats.testName}`);
  console.log('='.repeat(60));
  
  console.log(`🎯 Execution Summary:`);
  if (stats.setupDuration) {
    console.log(`   Setup Duration:     ${formatDuration(stats.setupDuration)}`);
  }
  console.log(`   Execution Duration: ${formatDuration(stats.executionDuration || stats.totalDuration)}`);
  if (stats.completionDuration) {
    console.log(`   Task Completion:    ${formatDuration(stats.completionDuration)}`);
  }
  console.log(`   Steps Completed:    ${stats.completedSteps.toLocaleString()} / ${stats.stepCount.toLocaleString()}`);
  console.log(`   Events Received:    ${stats.eventsReceived.toLocaleString()} / ${stats.expectedEvents.toLocaleString()}`);
  
  if (stats.eventCounts && stats.expectedEventCounts) {
    console.log(`\n📡 Event Breakdown:`);
    const runStartedPct = stats.expectedEventCounts.run_started > 0 ? formatNumber((stats.eventCounts.run_started / stats.expectedEventCounts.run_started) * 100) : '0.00';
    const runCompletedPct = stats.expectedEventCounts.run_completed > 0 ? formatNumber((stats.eventCounts.run_completed / stats.expectedEventCounts.run_completed) * 100) : '0.00';
    const runFailedPct = stats.expectedEventCounts.run_failed > 0 ? formatNumber((stats.eventCounts.run_failed / stats.expectedEventCounts.run_failed) * 100) : '0.00';
    const stepStartedPct = stats.expectedEventCounts.step_started > 0 ? formatNumber((stats.eventCounts.step_started / stats.expectedEventCounts.step_started) * 100) : '0.00';
    const stepCompletedPct = stats.expectedEventCounts.step_completed > 0 ? formatNumber((stats.eventCounts.step_completed / stats.expectedEventCounts.step_completed) * 100) : '0.00';
    const stepFailedPct = stats.expectedEventCounts.step_failed > 0 ? formatNumber((stats.eventCounts.step_failed / stats.expectedEventCounts.step_failed) * 100) : '0.00';
    
    console.log(`   run:started:        ${stats.eventCounts.run_started} / ${stats.expectedEventCounts.run_started} (${runStartedPct}%)`);
    console.log(`   run:completed:      ${stats.eventCounts.run_completed} / ${stats.expectedEventCounts.run_completed} (${runCompletedPct}%)`);
    console.log(`   run:failed:         ${stats.eventCounts.run_failed} / ${stats.expectedEventCounts.run_failed} (${runFailedPct}%)`);
    console.log(`   step:started:       ${stats.eventCounts.step_started} / ${stats.expectedEventCounts.step_started} (${stepStartedPct}%)`);
    console.log(`   step:completed:     ${stats.eventCounts.step_completed} / ${stats.expectedEventCounts.step_completed} (${stepCompletedPct}%)`);
    console.log(`   step:failed:        ${stats.eventCounts.step_failed} / ${stats.expectedEventCounts.step_failed} (${stepFailedPct}%)`);
    if (stats.eventCounts.other > 0) {
      const otherPct = (stats.expectedEventCounts.other || 0) > 0 ? formatNumber((stats.eventCounts.other / (stats.expectedEventCounts.other || 1)) * 100) : 'N/A';
      console.log(`   other:              ${stats.eventCounts.other} / ${stats.expectedEventCounts.other || 0} (${otherPct}%)`);
    }
  }
  
  console.log(`\n⚡ Throughput Metrics:`);
  console.log(`   Steps/second:       ${formatNumber(stats.stepsPerSecond)}`);
  console.log(`   Events/second:      ${formatNumber(stats.eventsPerSecond)}`);
  if (stats.tasksPerSecond) {
    console.log(`   Tasks/second:       ${formatNumber(stats.tasksPerSecond)}`);
  }
  
  if (stats.memoryUsage) {
    console.log(`\n💾 Memory Usage:`);
    console.log(`   Initial:            ${formatNumber(stats.memoryUsage.initial)} MB`);
    console.log(`   Final:              ${formatNumber(stats.memoryUsage.final)} MB`);
    console.log(`   Peak:               ${formatNumber(stats.memoryUsage.peak)} MB`);
    console.log(`   Growth:             ${formatNumber(stats.memoryUsage.growth)} MB`);
  }
  
  const successRate = (stats.completedSteps / stats.stepCount) * 100;
  const eventDeliveryRate = (stats.eventsReceived / stats.expectedEvents) * 100;
  
  console.log(`\n✅ Success Rates:`);
  console.log(`   Step Completion:    ${formatNumber(successRate)}%`);
  console.log(`   Event Delivery:     ${formatNumber(eventDeliveryRate)}%`);
  
  console.log('='.repeat(60));
}

async function runHighFrequencyTest() {
  console.log(`\n🚀 Starting High-Frequency Step Completion Test`);
  console.log(`   Target Steps: ${CONFIG.STEP_COUNT.toLocaleString()}`);
  
  const sql = postgres(CONFIG.DATABASE_URL);
  const supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  
  try {
    // SETUP PHASE (not measured in performance metrics)
    console.log(`🏗️  Setup Phase: Preparing database and flow...`);
    const setupStartTime = performance.now();
    
    await grantMinimalPgflowPermissions(sql);
    
    const testFlow = createTestFlow('high_frequency_flow');
    await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
    
    console.log(`📝 Creating ${CONFIG.STEP_COUNT} independent steps...`);
    for (let i = 0; i < CONFIG.STEP_COUNT; i++) {
      await sql`SELECT pgflow.add_step(${testFlow.slug}, ${`step_${i}`})`;
    }
    
    const sqlClient = new PgflowSqlClient(sql);
    const pgflowClient = new PgflowClient(supabaseClient);
    
    const setupDuration = performance.now() - setupStartTime;
    console.log(`✅ Setup completed in ${setupDuration}ms`);
    
    // EXECUTION PHASE (measured for performance)
    console.log(`⚡ Execution Phase: Starting performance measurement...`);
    const initialMemory = getMemoryUsage();
    let peakMemory = initialMemory;
    const eventCounts = {
      run_started: 0,
      run_completed: 0,
      run_failed: 0,
      step_started: 0,
      step_completed: 0,
      step_failed: 0,
      other: 0
    };
    let eventsReceived = 0;
    
    const executionStartTime = performance.now();
    
    const input = { 
      data: 'high-frequency-perf-test',
      timestamp: Date.now(),
      stepCount: CONFIG.STEP_COUNT 
    };
    
    const run = await pgflowClient.startFlow(testFlow.slug, input);
    
    // Track events with detailed counting
    run.on('*', (event) => {
      eventsReceived++;
      
      // DEBUG: Log each event received by the benchmark
      console.log(`📊 [BENCHMARK] RUN EVENT RECEIVED:`, {
        event_type: event.event_type,
        run_id: event.run_id,
        step_slug: event.step_slug || 'N/A'
      });
      
      // Count by event type using event_type field
      if (event.event_type === 'run:started') {
        eventCounts.run_started++;
      } else if (event.event_type === 'run:completed') {
        eventCounts.run_completed++;
      } else if (event.event_type === 'run:failed') {
        eventCounts.run_failed++;
      } else {
        eventCounts.other++;
        console.log(`📊 [BENCHMARK] UNKNOWN RUN EVENT TYPE:`, event.event_type);
      }
      
      const currentMemory = getMemoryUsage();
      if (currentMemory > peakMemory) peakMemory = currentMemory;
    });
    
    // Set up step event listeners for each step
    for (let i = 0; i < CONFIG.STEP_COUNT; i++) {
      const stepSlug = `step_${i}`;
      const step = run.step(stepSlug);
      
      step.on('*', (event) => {
        eventsReceived++;
        
        // DEBUG: Log each step event received by the benchmark
        console.log(`📊 [BENCHMARK] STEP EVENT RECEIVED:`, {
          event_type: event.event_type,
          run_id: event.run_id,
          step_slug: event.step_slug || 'N/A'
        });
        
        // Count step events
        if (event.event_type === 'step:started') {
          eventCounts.step_started++;
        } else if (event.event_type === 'step:completed') {
          eventCounts.step_completed++;
        } else if (event.event_type === 'step:failed') {
          eventCounts.step_failed++;
        } else {
          eventCounts.other++;
          console.log(`📊 [BENCHMARK] UNKNOWN STEP EVENT TYPE:`, event.event_type);
        }
        
        const currentMemory = getMemoryUsage();
        if (currentMemory > peakMemory) peakMemory = currentMemory;
      });
    }
    
    // Give subscription time to establish
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    console.log(`⚙️  Polling for ${CONFIG.STEP_COUNT} tasks...`);
    const tasks = await sqlClient.pollForTasks(
      testFlow.slug,
      CONFIG.STEP_COUNT * 2, // Double the expected to ensure we get all
      10, // More retries
      300, // Longer wait between retries
      60 // Longer visibility timeout
    );
    
    console.log(`📋 Retrieved ${tasks.length} tasks`);
    if (tasks.length !== CONFIG.STEP_COUNT) {
      console.warn(`⚠️  Expected ${CONFIG.STEP_COUNT} tasks, got ${tasks.length}`);
    }
    
    const completionStartTime = performance.now();
    
    console.log(`🔄 Completing tasks in batches of ${CONFIG.COMPLETION_BATCH_SIZE}...`);
    
    // Complete tasks in batches for better performance
    const batchPromises = [];
    for (let i = 0; i < tasks.length; i += CONFIG.COMPLETION_BATCH_SIZE) {
      const batch = tasks.slice(i, i + CONFIG.COMPLETION_BATCH_SIZE);
      const batchPromise = Promise.all(
        batch.map((task) =>
          sqlClient.completeTask(task, {
            result: `${task.step_slug}-completed`,
            timestamp: Date.now(),
            batchIndex: Math.floor(i / CONFIG.COMPLETION_BATCH_SIZE),
          })
        )
      ).then(() => {
        process.stdout.write('.');
      });
      batchPromises.push(batchPromise);
    }
    
    await Promise.all(batchPromises);
    console.log(' ✅ All tasks completed');
    
    const completionEndTime = performance.now();
    
    console.log(`⏳ Waiting for flow completion...`);
    await run.waitForStatus(FlowRunStatus.Completed, { 
      timeoutMs: CONFIG.MAX_COMPLETION_TIME_MS 
    });
    
    const executionEndTime = performance.now();
    const executionDuration = executionEndTime - executionStartTime;
    const completionDuration = completionEndTime - completionStartTime;
    const finalMemory = getMemoryUsage();
    
    console.log(`📊 Execution completed in ${executionDuration}ms (setup: ${setupDuration}ms)`);
    
    const expectedEventCounts = {
      run_started: 1,
      run_completed: 1,
      run_failed: 0,
      step_started: CONFIG.STEP_COUNT,
      step_completed: CONFIG.STEP_COUNT,
      step_failed: 0,
      other: 0
    };
    
    const stats = {
      testName: 'High-Frequency Step Completion',
      setupDuration,
      executionDuration,
      completionDuration, // Time to complete tasks only
      stepCount: CONFIG.STEP_COUNT,
      completedSteps: tasks.length,
      eventsReceived,
      eventCounts,
      expectedEventCounts,
      expectedEvents: CONFIG.STEP_COUNT * 2 + 2, // step events (started + completed) + run events (started + completed)
      stepsPerSecond: (tasks.length / completionDuration) * 1000,
      eventsPerSecond: (eventsReceived / executionDuration) * 1000, // Use consistent denominator
      tasksPerSecond: (tasks.length / completionDuration) * 1000,
      memoryUsage: {
        initial: initialMemory,
        final: finalMemory,
        peak: peakMemory,
        growth: finalMemory - initialMemory,
      },
    };
    
    await supabaseClient.removeAllChannels();
    return stats;
    
  } finally {
    await sql.end();
  }
}

async function runConcurrentFlowsTest() {
  console.log(`\n🔄 Starting Concurrent Flows Test`);
  console.log(`   Concurrent Flows: ${CONFIG.CONCURRENT_FLOWS}`);
  console.log(`   Steps per Flow: ${CONFIG.STEPS_PER_FLOW}`);
  
  const sql = postgres(CONFIG.DATABASE_URL);
  const supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  
  try {
    await grantMinimalPgflowPermissions(sql);
    
    const initialMemory = getMemoryUsage();
    let peakMemory = initialMemory;
    let eventsReceived = 0;
    
    console.log(`📝 Creating ${CONFIG.CONCURRENT_FLOWS} flows...`);
    const flows = [];
    for (let i = 0; i < CONFIG.CONCURRENT_FLOWS; i++) {
      const flowSlug = `concurrent_perf_flow_${i}_${Date.now()}`;
      flows.push(flowSlug);
      
      await sql`SELECT pgflow.create_flow(${flowSlug})`;
      for (let j = 0; j < CONFIG.STEPS_PER_FLOW; j++) {
        await sql`SELECT pgflow.add_step(${flowSlug}, ${`step_${j}`})`;
      }
    }
    
    const sqlClient = new PgflowSqlClient(sql);
    const pgflowClient = new PgflowClient(supabaseClient);
    
    const startTime = Date.now();
    
    console.log(`🚀 Starting all flows concurrently...`);
    const runPromises = flows.map((flowSlug, index) =>
      pgflowClient.startFlow(flowSlug, {
        flowIndex: index,
        data: 'concurrent-perf-test',
        timestamp: Date.now(),
      })
    );
    
    const runs = await Promise.all(runPromises);
    
    // Track events from all runs
    const eventCounts = {
      run_started: 0,
      run_completed: 0,
      run_failed: 0,
      step_started: 0,
      step_completed: 0,
      step_failed: 0,
      other: 0
    };
    
    runs.forEach((run, runIndex) => {
      run.on('*', (event) => {
        eventsReceived++;
        
        // DEBUG: Log each event received by the benchmark
        console.log(`📊 [BENCHMARK] CONCURRENT RUN EVENT RECEIVED:`, {
          event_type: event.event_type,
          run_id: event.run_id,
          step_slug: event.step_slug || 'N/A',
          run_index: runIndex
        });
        
        // Count by event type using event_type field
        if (event.event_type === 'run:started') {
          eventCounts.run_started++;
        } else if (event.event_type === 'run:completed') {
          eventCounts.run_completed++;
        } else if (event.event_type === 'run:failed') {
          eventCounts.run_failed++;
        } else {
          eventCounts.other++;
          console.log(`📊 [BENCHMARK] UNKNOWN CONCURRENT RUN EVENT TYPE:`, event.event_type);
        }
        
        const currentMemory = getMemoryUsage();
        if (currentMemory > peakMemory) peakMemory = currentMemory;
      });
      
      // Set up step event listeners for each step in this run
      for (let j = 0; j < CONFIG.STEPS_PER_FLOW; j++) {
        const stepSlug = `step_${j}`;
        const step = run.step(stepSlug);
        
        step.on('*', (event) => {
          eventsReceived++;
          
          // DEBUG: Log each step event received by the benchmark
          console.log(`📊 [BENCHMARK] CONCURRENT STEP EVENT RECEIVED:`, {
            event_type: event.event_type,
            run_id: event.run_id,
            step_slug: event.step_slug || 'N/A',
            run_index: runIndex
          });
          
          // Count step events
          if (event.event_type === 'step:started') {
            eventCounts.step_started++;
          } else if (event.event_type === 'step:completed') {
            eventCounts.step_completed++;
          } else if (event.event_type === 'step:failed') {
            eventCounts.step_failed++;
          } else {
            eventCounts.other++;
            console.log(`📊 [BENCHMARK] UNKNOWN CONCURRENT STEP EVENT TYPE:`, event.event_type);
          }
          
          const currentMemory = getMemoryUsage();
          if (currentMemory > peakMemory) peakMemory = currentMemory;
        });
      }
    });
    
    // Give subscriptions time to establish
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    console.log(`⚙️  Processing all tasks...`);
    const taskCompletionStartTime = Date.now();
    let completedTasks = 0;
    
    // Process flows in parallel with limited concurrency
    const CONCURRENT_FLOW_PROCESSING = 5;
    for (let i = 0; i < flows.length; i += CONCURRENT_FLOW_PROCESSING) {
      const batchFlows = flows.slice(i, i + CONCURRENT_FLOW_PROCESSING);
      
      await Promise.all(batchFlows.map(async (flowSlug) => {
        const tasks = await sqlClient.pollForTasks(flowSlug, 10, 5, 200, 30);
        
        await Promise.all(tasks.map(async (task) => {
          await sqlClient.completeTask(task, {
            result: `${task.step_slug}-completed`,
            timestamp: Date.now(),
          });
          completedTasks++;
        }));
        
        process.stdout.write('.');
      }));
    }
    console.log(' ✅ All tasks completed');
    
    const taskCompletionEndTime = Date.now();
    
    console.log(`⏳ Waiting for all flows to complete...`);
    await Promise.all(runs.map(run => 
      run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: CONFIG.MAX_COMPLETION_TIME_MS })
    ));
    
    const totalDuration = Date.now() - startTime;
    const taskCompletionDuration = taskCompletionEndTime - taskCompletionStartTime;
    const finalMemory = getMemoryUsage();
    
    const totalSteps = CONFIG.CONCURRENT_FLOWS * CONFIG.STEPS_PER_FLOW;
    const expectedEvents = totalSteps * 2; // started + completed for each step
    
    const expectedEventCounts = {
      run_started: CONFIG.CONCURRENT_FLOWS,
      run_completed: CONFIG.CONCURRENT_FLOWS,
      run_failed: 0,
      step_started: totalSteps,
      step_completed: totalSteps,
      step_failed: 0,
      other: 0
    };
    
    const stats = {
      testName: 'Concurrent Flows',
      totalDuration,
      stepCount: totalSteps,
      completedSteps: completedTasks,
      eventsReceived,
      eventCounts,
      expectedEventCounts,
      expectedEvents: CONFIG.CONCURRENT_FLOWS * 2 + totalSteps * 2, // run events (started + completed) + step events (started + completed)
      stepsPerSecond: (completedTasks / taskCompletionDuration) * 1000,
      eventsPerSecond: (eventsReceived / totalDuration) * 1000,
      tasksPerSecond: (completedTasks / taskCompletionDuration) * 1000,
      memoryUsage: {
        initial: initialMemory,
        final: finalMemory,
        peak: peakMemory,
        growth: finalMemory - initialMemory,
      },
    };
    
    await supabaseClient.removeAllChannels();
    return stats;
    
  } finally {
    await sql.end();
  }
}

async function main() {
  console.log('🎯 pgflow Client Performance Benchmark');
  console.log('=====================================');
  console.log(`📊 Configuration:`);
  console.log(`   Step Count: ${CONFIG.STEP_COUNT.toLocaleString()}`);
  console.log(`   Concurrent Flows: ${CONFIG.CONCURRENT_FLOWS}`);
  console.log(`   Steps per Flow: ${CONFIG.STEPS_PER_FLOW}`);
  console.log(`   Completion Batch Size: ${CONFIG.COMPLETION_BATCH_SIZE}`);
  console.log(`   Max Completion Time: ${formatDuration(CONFIG.MAX_COMPLETION_TIME_MS)}`);
  
  const allStats = [];
  
  try {
    // Test 1: High-frequency step completions
    const highFreqStats = await runHighFrequencyTest();
    allStats.push(highFreqStats);
    printPerformanceStats(highFreqStats);
    
    // Small delay between tests
    console.log('\n⏱️  Waiting 2 seconds before next test...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Concurrent flows
    const concurrentStats = await runConcurrentFlowsTest();
    allStats.push(concurrentStats);
    printPerformanceStats(concurrentStats);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 BENCHMARK SUMMARY');
    console.log('='.repeat(60));
    
    allStats.forEach((stats, index) => {
      console.log(`${index + 1}. ${stats.testName}:`);
      console.log(`   Steps/sec: ${formatNumber(stats.stepsPerSecond)}`);
      console.log(`   Events/sec: ${formatNumber(stats.eventsPerSecond)}`);
      console.log(`   Success Rate: ${formatNumber((stats.completedSteps / stats.stepCount) * 100)}%`);
      console.log(`   Memory Growth: ${formatNumber(stats.memoryUsage?.growth || 0)} MB`);
    });
    
    const totalSteps = allStats.reduce((sum, stats) => sum + stats.completedSteps, 0);
    const totalEvents = allStats.reduce((sum, stats) => sum + stats.eventsReceived, 0);
    const totalDuration = allStats.reduce((sum, stats) => sum + (stats.executionDuration || stats.totalDuration), 0);
    
    console.log(`\n🏆 Overall Performance:`);
    console.log(`   Total Steps Completed: ${totalSteps.toLocaleString()}`);
    console.log(`   Total Events Received: ${totalEvents.toLocaleString()}`);
    console.log(`   Total Execution Time: ${formatDuration(totalDuration)}`);
    console.log(`   Average Steps/sec: ${formatNumber((totalSteps / totalDuration) * 1000)}`);
    console.log(`   Average Events/sec: ${formatNumber((totalEvents / totalDuration) * 1000)}`);
    
    console.log('\n✅ Benchmark completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run the benchmark
main().catch(console.error);