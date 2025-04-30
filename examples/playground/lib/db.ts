import { createClient } from '@/utils/supabase/client';
import { Database } from '@/supabase/functions/database-types';
import type {
  RealtimePostgresChangesPayload,
  RealtimePostgresChangesFilter,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
} from '@supabase/supabase-js';

export type RunRow = Database['pgflow']['Tables']['runs']['Row'];
export type StepStateRow =
  Database['pgflow']['Tables']['step_states']['Row'] & {
    step: {
      step_index: number;
    };
  };
export type StepTaskRow = Database['pgflow']['Tables']['step_tasks']['Row'];

// Define a type that reflects the actual structure returned from the query
export type ResultRow = RunRow & {
  step_states: StepStateRow[];
  step_tasks: StepTaskRow[];
  status?: 'started' | 'completed' | 'failed';
};

// Define RealtimePayload type to handle different event types
interface RealtimePayload<T extends Record<string, any>> {
  new: T;
  old: T | null;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  commit_timestamp: string;
}

export type ObserveFlowRunCallbacks = {
  onRunUpdate: (payload: RealtimePayload<RunRow>) => void;
  onStepStateUpdate: (payload: RealtimePayload<StepStateRow>) => void;
  onStepTaskUpdate: (payload: RealtimePayload<StepTaskRow>) => void;
};

export async function fetchFlowRunData(runId: string): Promise<{
  data: ResultRow | null;
  error: string | null;
}> {
  const supabase = createClient();

  try {
    // Fetch the flow run data
    const { data, error } = await supabase
      .schema('pgflow')
      .from('runs')
      .select(
        `
        *,
        step_states!step_states_run_id_fkey(
          *,
          step:steps!inner(step_index)
        ),
        step_tasks!step_tasks_run_id_fkey(*)
      `,
      )
      .eq('run_id', runId)
      .single<ResultRow>();

    if (error) {
      return { data: null, error: `Error fetching run data: ${error.message}` };
    }

    return { data, error: null };
  } catch (err) {
    console.error('Error fetching flow run:', err);
    return {
      data: null,
      error: 'An error occurred while fetching the flow run data',
    };
  }
}

export function observeFlowRun({
  runId,
  onRunUpdate,
  onStepStateUpdate,
  onStepTaskUpdate,
}: {
  runId: string;
} & ObserveFlowRunCallbacks) {
  const supabase = createClient();

  const eventSpec: RealtimePostgresChangesFilter<`${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.ALL}`> =
    {
      schema: 'pgflow',
      event: '*',
      filter: `run_id=eq.${runId}`,
    };

  const realtimeChannel = supabase
    .channel(`flow_run_${runId}`)
    .on('postgres_changes' as any, { ...eventSpec, table: 'runs' }, onRunUpdate)
    .on(
      'postgres_changes' as any,
      { ...eventSpec, table: 'step_states' },
      onStepStateUpdate,
    )
    .on(
      'postgres_changes' as any,
      { ...eventSpec, table: 'step_tasks' },
      onStepTaskUpdate,
    )
    .subscribe();

  return {
    unsubscribe: () => {
      realtimeChannel.unsubscribe();
    },
  };
}
