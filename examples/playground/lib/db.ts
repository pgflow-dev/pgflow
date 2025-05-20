import { createClient as createBrowserClient } from '@/utils/supabase/browser-client';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { logger } from '@/utils/utils';
import { Database } from '@/supabase/functions/database-types';
import type {
  RealtimePostgresUpdatePayload,
  RealtimePostgresChangesFilter,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  RealtimePostgresInsertPayload,
} from '@supabase/supabase-js';

export type RunRow = Database['pgflow']['Tables']['runs']['Row'];
export type StepStateRow =
  Database['pgflow']['Tables']['step_states']['Row'] & {
    step: {
      step_index: number;
    };
  };
export type StepTaskRow = Database['pgflow']['Tables']['step_tasks']['Row'] & {
  step_index?: number; // Adding optional step_index for sorting
};

// Define a type that reflects the actual structure returned from the query
export type ResultRow = RunRow & {
  step_states: StepStateRow[];
  step_tasks: StepTaskRow[];
  status?: 'started' | 'completed' | 'failed' | 'error' | 'cancelled';
};

export type ObserveFlowRunCallbacks = {
  onRunUpdate: (payload: RealtimePostgresUpdatePayload<RunRow>) => void;
  onStepStateUpdate: (
    payload: RealtimePostgresUpdatePayload<StepStateRow>,
  ) => void;
  onStepTaskInsert: (
    payload: RealtimePostgresInsertPayload<StepTaskRow>,
  ) => void;
  onStepTaskUpdate: (
    payload: RealtimePostgresUpdatePayload<StepTaskRow>,
  ) => void;
};

// Helper function for common query elements to use in both full and optimized queries
function buildRunQuery(supabase: any, runId: string, isOptimized = false) {
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

// Full data fetch - used on initial load and completion
export async function fetchFlowRunData(runId: string): Promise<{
  data: ResultRow | null;
  error: string | null;
}> {
  const supabase = createBrowserClient();

  try {
    // Full data fetch including all input and output blobs
    const { data, error } = await buildRunQuery(supabase, runId, false)
      .single();

    if (error) {
      return { data: null, error: `Error fetching run data: ${error.message}` };
    }

    return { data, error: null };
  } catch (err) {
    logger.error('Error fetching flow run:', err);
    return {
      data: null,
      error: 'An error occurred while fetching the flow run data',
    };
  }
}

// Optimized fetch - used for realtime updates, omits large output and input blobs
export async function fetchOptimizedFlowRunData(runId: string): Promise<{
  data: ResultRow | null;
  error: string | null;
}> {
  const supabase = createBrowserClient();

  try {
    // Optimized query omitting large input/output blobs
    const { data, error } = await buildRunQuery(supabase, runId, true)
      .single();

    if (error) {
      return { data: null, error: `Error fetching optimized run data: ${error.message}` };
    }

    logger.log('Fetched optimized run data without full output blobs');
    return { data, error: null };
  } catch (err) {
    logger.error('Error fetching optimized flow run:', err);
    return {
      data: null,
      error: 'An error occurred while fetching the optimized flow run data',
    };
  }
}

export function observeFlowRun({
  runId,
  onRunUpdate,
  onStepStateUpdate,
  onStepTaskInsert,
  onStepTaskUpdate,
}: {
  runId: string;
} & ObserveFlowRunCallbacks) {
  const supabase = createBrowserClient();

  const updateEventSpec: RealtimePostgresChangesFilter<`${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE}`> =
    {
      schema: 'pgflow',
      event: 'UPDATE',
      filter: `run_id=eq.${runId}`,
    };

  const insertEventSpec: RealtimePostgresChangesFilter<`${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT}`> =
    {
      schema: 'pgflow',
      event: 'INSERT',
      filter: `run_id=eq.${runId}`,
    };

  const realtimeChannel = supabase
    .channel(`flow_run_${runId}`)
    .on('postgres_changes', { ...updateEventSpec, table: 'runs' }, onRunUpdate)
    .on(
      'postgres_changes',
      { ...updateEventSpec, table: 'step_states' },
      onStepStateUpdate,
    )
    // Listen for both INSERTs and UPDATEs on step_tasks to track progress including retries (attempts_count)
    .on(
      'postgres_changes' as any,
      { ...updateEventSpec, table: 'step_tasks' },
      onStepTaskUpdate,
    )
    .on(
      'postgres_changes' as any,
      { ...insertEventSpec, table: 'step_tasks' },
      onStepTaskInsert,
    )
    .subscribe();

  return {
    unsubscribe: () => {
      realtimeChannel.unsubscribe();
    },
  };
}
