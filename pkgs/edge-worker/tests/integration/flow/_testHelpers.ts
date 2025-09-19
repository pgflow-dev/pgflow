import { assertEquals } from '@std/assert';
import { waitFor } from '../../e2e/_helpers.ts';
import { delay } from '@std/async';
import type { postgres } from '../../sql.ts';
import type { Json } from '@pgflow/core';

// ============= Reusable Test Helpers for Flow Integration Tests =============

/**
 * Wait for a flow run to reach a terminal state (completed or failed)
 */
export const waitForRunCompletion = async (
  sql: postgres.Sql,
  runId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
) => {
  return await waitFor(
    async () => {
      const [run] = await sql`
        SELECT * FROM pgflow.runs
        WHERE run_id = ${runId}
          AND status IN ('completed', 'failed')
        LIMIT 1
      `;
      return run || false;
    },
    {
      pollIntervalMs: options?.pollIntervalMs ?? 500,
      timeoutMs: options?.timeoutMs ?? 15000,
      description: `flow run ${runId} to complete`,
    }
  );
};

/**
 * Create a flow with a single root map step
 */
export const createRootMapFlow = async (
  sql: postgres.Sql,
  flowSlug: string,
  stepSlug: string
) => {
  await sql`select pgflow.create_flow(${flowSlug});`;
  await sql`select pgflow.add_step(${flowSlug}, ${stepSlug}, ARRAY[]::text[], null, null, null, null, 'map');`;
};

/**
 * Create a flow with single steps (non-map) with dependencies
 */
export const createSimpleFlow = async (
  sql: postgres.Sql,
  flowSlug: string,
  steps: Array<{ slug: string; deps: string[] }>
) => {
  await sql`select pgflow.create_flow(${flowSlug});`;
  for (const step of steps) {
    if (step.deps.length > 0) {
      await sql`select pgflow.add_step(${flowSlug}, ${step.slug}, deps_slugs => ARRAY[${step.deps}]::text[]);`;
    } else {
      await sql`select pgflow.add_step(${flowSlug}, ${step.slug});`;
    }
  }
};

/**
 * Create a flow with mixed step types (single and map)
 */
export const createMixedFlow = async (
  sql: postgres.Sql,
  flowSlug: string,
  steps: Array<{ slug: string; deps: string[]; type: 'single' | 'map' }>
) => {
  await sql`select pgflow.create_flow(${flowSlug});`;
  for (const step of steps) {
    const deps = step.deps.length > 0 ? sql`ARRAY[${step.deps}]::text[]` : sql`ARRAY[]::text[]`;
    await sql`select pgflow.add_step(${flowSlug}, ${step.slug}, ${deps}, null, null, null, null, ${step.type});`;
  }
};

/**
 * Get step states for a run
 */
export const getStepStates = async (sql: postgres.Sql, runId: string) => {
  return await sql<{ step_slug: string; status: string }[]>`
    SELECT step_slug, status FROM pgflow.step_states
    WHERE run_id = ${runId}
    ORDER BY step_slug;
  `;
};

/**
 * Get step tasks for a run, optionally filtered by step
 */
export const getStepTasks = async (
  sql: postgres.Sql,
  runId: string,
  stepSlug?: string
) => {
  const whereClause = stepSlug
    ? sql`WHERE run_id = ${runId} AND step_slug = ${stepSlug}`
    : sql`WHERE run_id = ${runId}`;

  return await sql<
    { step_slug: string; status: string; output: Json; task_index: number }[]
  >`
    SELECT step_slug, status, output, task_index FROM pgflow.step_tasks
    ${whereClause}
    ORDER BY step_slug, task_index;
  `;
};

/**
 * Get the final output of a run
 */
export const getRunOutput = async (sql: postgres.Sql, runId: string) => {
  const [run] = await sql<{ status: string; output: Json }[]>`
    SELECT status, output FROM pgflow.runs WHERE run_id = ${runId};
  `;
  return run;
};

/**
 * Assert all steps have completed successfully
 */
export const assertAllStepsCompleted = (
  stepStates: Array<{ step_slug: string; status: string }>
) => {
  for (const state of stepStates) {
    assertEquals(state.status, 'completed', `${state.step_slug} should be completed`);
  }
};

/**
 * Assert all tasks have completed successfully
 */
export const assertAllTasksCompleted = (
  stepTasks: Array<{ step_slug: string; status: string }>
) => {
  for (const task of stepTasks) {
    assertEquals(
      task.status,
      'completed',
      `Task for ${task.step_slug} should be completed`
    );
  }
};

/**
 * Monitor progress of task execution and display updates
 */
export const monitorProgress = async (
  sql: postgres.Sql,
  runId: string,
  totalExpected: number,
  options?: {
    intervalMs?: number;
    showProgress?: boolean;
  }
): Promise<void> => {
  const intervalMs = options?.intervalMs ?? 1000;
  const showProgress = options?.showProgress ?? true;

  if (!showProgress) return;

  const startTime = Date.now();

  const checkProgress = async () => {
    const [stats] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM pgflow.step_tasks
      WHERE run_id = ${runId}
    `;

    const completed = Number(stats.completed);
    const failed = Number(stats.failed);
    const total = Number(stats.total);

    if (total === 0) return { completed: 0, failed: 0, total: 0, done: false };

    // Calculate rate and ETA
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = completed / elapsed;
    const remaining = totalExpected - completed;
    const eta = rate > 0 ? remaining / rate : 0;

    // Format progress bar
    const percentage = Math.floor((completed / totalExpected) * 100);
    const barLength = 30;
    const filledLength = Math.floor((completed / totalExpected) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    // Update single line with carriage return
    const encoder = new TextEncoder();
    const progressText = `\r⏳ Progress: [${bar}] ${percentage}% | ${completed}/${totalExpected} tasks | ${rate.toFixed(1)}/s | ETA: ${eta.toFixed(0)}s`;
    await Deno.stdout.write(encoder.encode(progressText));

    const done = completed + failed >= totalExpected;
    if (done) {
      // Clear the line and print final status
      await Deno.stdout.write(encoder.encode('\r' + ' '.repeat(80) + '\r'));
      console.log(`✅ Completed: ${completed}/${totalExpected} tasks in ${elapsed.toFixed(1)}s (${rate.toFixed(1)} tasks/s)`);
    }

    return { completed, failed, total, done };
  };

  // Poll until done
  while (true) {
    const { done } = await checkProgress();
    if (done) break;
    await delay(intervalMs);
  }
};