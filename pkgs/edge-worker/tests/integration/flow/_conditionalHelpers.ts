import type { postgres } from '../../sql.ts';
import { compileFlow } from '@pgflow/dsl';
import type { AnyFlow } from '@pgflow/dsl';

// ============= Test Helpers for Conditional Flow Integration Tests =============

/**
 * Compiles a Flow and executes SQL statements to create it in the database.
 */
export const createFlowInDb = async (sql: postgres.Sql, flow: AnyFlow) => {
  const statements = compileFlow(flow);
  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
};

/**
 * Extended step state info including skip details
 */
export interface StepStateWithSkip {
  step_slug: string;
  status: string;
  skip_reason: string | null;
  skipped_at: string | null;
}

/**
 * Get step states with skip information
 */
export const getStepStatesWithSkip = async (
  sql: postgres.Sql,
  runId: string
): Promise<StepStateWithSkip[]> => {
  return await sql<StepStateWithSkip[]>`
    SELECT step_slug, status, skip_reason, skipped_at
    FROM pgflow.step_states
    WHERE run_id = ${runId}
    ORDER BY step_slug;
  `;
};

/**
 * Extended task info including error details
 */
export interface TaskWithError {
  step_slug: string;
  status: string;
  error_message: string | null;
  attempts_count: number;
}

/**
 * Get step tasks with error information
 */
export const getStepTasksWithError = async (
  sql: postgres.Sql,
  runId: string
): Promise<TaskWithError[]> => {
  return await sql<TaskWithError[]>`
    SELECT step_slug, status, error_message, attempts_count
    FROM pgflow.step_tasks
    WHERE run_id = ${runId}
    ORDER BY step_slug, task_index;
  `;
};
