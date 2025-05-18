// lib/services/get-flow-run.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { ResultRow } from '@/lib/db';
import { logger } from '@/utils/utils';

/**
 * Server-side function to fetch flow run data
 */
// Helper function for common query elements to use in both full and optimized queries
function buildServerRunQuery(supabase: any, runId: string, isOptimized = false) {
  // Basic run data is always needed
  const runFields = isOptimized 
    ? 'run_id, flow_slug, started_at, completed_at, failed_at, status, remaining_steps'
    : '*'; // Full run data including input, output blobs
  
  // Step states always need full data (relatively small)
  const stepStateFields = '*';
  
  // Step tasks - include output for summary and tags steps, even in optimized queries
  const stepTaskFields = isOptimized
    ? 'run_id, step_slug, task_index, flow_slug, attempts_count, status, error_message, queued_at, completed_at, failed_at, message_id, output'
    : '*'; // Full task data including output blobs
  
  return supabase
    .schema('pgflow')
    .from('runs')
    .select(
      `
      ${runFields},
      step_states!step_states_run_id_fkey(
        ${stepStateFields},
        step:steps!inner(step_index)
      ),
      step_tasks!step_tasks_run_id_fkey(${stepTaskFields})
    `,
    )
    .eq('run_id', runId);
}

/**
 * Server-side function to fetch complete flow run data
 * This is the full data including all output blobs
 */
export async function getFlowRunData(runId: string): Promise<{
  data: ResultRow | null;
  error: string | null;
}> {
  const supabase = await createClient();

  try {
    // Use full data query including all blobs
    const { data, error } = await buildServerRunQuery(supabase, runId, false)
      .single<ResultRow>();

    if (error) {
      return { data: null, error: `Error fetching run data: ${error.message}` };
    }

    return { data, error: null };
  } catch (err: any) {
    logger.error('Error fetching flow run:', err);
    return {
      data: null,
      error: 'An error occurred while fetching the flow run data',
    };
  }
}

/**
 * Server-side function to fetch optimized flow run data
 * This excludes large output blobs for faster loading
 */
export async function getOptimizedFlowRunData(runId: string): Promise<{
  data: ResultRow | null;
  error: string | null;
}> {
  const supabase = await createClient();

  try {
    // Use optimized query excluding large blobs
    const { data, error } = await buildServerRunQuery(supabase, runId, true)
      .single<ResultRow>();

    if (error) {
      return { data: null, error: `Error fetching optimized run data: ${error.message}` };
    }

    return { data, error: null };
  } catch (err: any) {
    logger.error('Error fetching optimized flow run:', err);
    return {
      data: null,
      error: 'An error occurred while fetching the optimized flow run data',
    };
  }
}