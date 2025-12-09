import { assertEquals, assertAlmostEquals } from '@std/assert';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import {
  createFlowWorker,
  type FlowWorkerConfig,
} from '../../src/flow/createFlowWorker.ts';
import type { postgres } from '../sql.ts';
import { PgflowSqlClient } from '@pgflow/core';
import type { PlatformAdapter, CreateWorkerFn } from '../../src/platform/types.ts';
import type { SupabaseResources, SupabaseEnv } from '@pgflow/dsl/supabase';
import { createServiceSupabaseClient } from '../../src/core/supabase-utils.ts';
import { integrationConfig } from '../config.ts';

const DEFAULT_TEST_SUPABASE_ENV: SupabaseEnv = {
  SUPABASE_DB_URL: 'postgresql://test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SB_EXECUTION_ID: 'test-execution-id',
};

export async function startFlow<TFlow extends AnyFlow>(
  sql: postgres.Sql,
  flow: TFlow,
  input: ExtractFlowInput<TFlow>
) {
  const pgflow = new PgflowSqlClient<TFlow>(sql);

  return await pgflow.startFlow(flow.slug, input);
}

export function createTestPlatformAdapter(sql: postgres.Sql): PlatformAdapter<SupabaseResources> {
  const abortController = new AbortController();

  const platformResources: SupabaseResources = {
    sql,
    supabase: createServiceSupabaseClient(DEFAULT_TEST_SUPABASE_ENV),
  };

  return {
    get env() { return DEFAULT_TEST_SUPABASE_ENV; },
    get shutdownSignal() { return abortController.signal; },
    get platformResources() { return platformResources; },
    get connectionString() { return integrationConfig.dbUrl; },
    get isLocalEnvironment() { return false; },
    async startWorker(_createWorkerFn: CreateWorkerFn) {},
    async stopWorker() {},
  };
}

export function startWorker<TFlow extends AnyFlow>(
  sql: postgres.Sql,
  flow: TFlow,
  options: FlowWorkerConfig
) {
  const defaultOptions = {
    sql,
    maxConcurrent: 1,
    batchSize: 10,
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
  };

  const consoleLogger = {
    debug: console.log,
    verbose: console.log,
    info: console.log,
    warn: console.warn,
    error: console.error,
  };

  const worker = createFlowWorker(flow, mergedOptions, () => consoleLogger, createTestPlatformAdapter(sql));

  worker.startOnlyOnce({
    edgeFunctionName: 'test_flow',
    workerId: crypto.randomUUID(),
  });

  return worker;
}

// ============================================================================
// Handler Spy & Delay Utilities
// ============================================================================

/**
 * Represents a single invocation captured by the handler spy.
 */
export interface SpyInvocation<TInput, TContext> {
  jsTime: number;
  input: TInput;
  context: TContext;
}

/**
 * Creates a handler spy that captures invocations with timing data.
 * @param onInvoke - Optional callback to execute on each invocation (throw to simulate failure)
 */
export function createHandlerSpy<TInput = unknown, TContext = unknown>(
  onInvoke?: (input: TInput, context: TContext) => void
) {
  const invocations: SpyInvocation<TInput, TContext>[] = [];

  return {
    handler: (input: TInput, context: TContext) => {
      invocations.push({ jsTime: Date.now(), input, context });
      return onInvoke?.(input, context);
    },
    invocations,
    count: () => invocations.length,
  };
}

/**
 * Calculates delays between invocations using JS timestamps.
 * @returns Delays in seconds between consecutive invocations.
 */
export function calculateJsDelays<T, C>(
  invocations: SpyInvocation<T, C>[]
): number[] {
  const delays: number[] = [];
  for (let i = 1; i < invocations.length; i++) {
    delays.push((invocations[i].jsTime - invocations[i - 1].jsTime) / 1000);
  }
  return delays;
}

/**
 * Context type that includes rawMessage with visibility time.
 */
type WithRawMessage = { rawMessage: { vt: string } };

/**
 * Calculates delays between invocations using DB visibility times.
 * @returns Delays in seconds between consecutive visibility times.
 */
export function calculateVtDelays<T, C extends WithRawMessage>(
  invocations: SpyInvocation<T, C>[]
): number[] {
  const delays: number[] = [];
  for (let i = 1; i < invocations.length; i++) {
    const vt1 = new Date(invocations[i - 1].context.rawMessage.vt).getTime();
    const vt2 = new Date(invocations[i].context.rawMessage.vt).getTime();
    delays.push((vt2 - vt1) / 1000);
  }
  return delays;
}

/**
 * Asserts that actual delays match expected delays within tolerance.
 * @param actual - Actual measured delays in seconds
 * @param expected - Expected delays in seconds
 * @param toleranceSec - Tolerance in seconds for each comparison
 */
export function assertDelaysMatch(
  actual: number[],
  expected: number[],
  toleranceSec: number
): void {
  assertEquals(
    actual.length,
    expected.length,
    `Expected ${expected.length} delays, got ${actual.length}`
  );
  for (let i = 0; i < expected.length; i++) {
    assertAlmostEquals(
      actual[i],
      expected[i],
      toleranceSec,
      `Delay #${i + 1} should be ~${expected[i]}s, got ${actual[i]}s`
    );
  }
}
