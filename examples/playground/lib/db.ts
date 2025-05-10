import { createClient } from '@/utils/supabase/client';
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
  onStepTaskInsert,
  onStepTaskUpdate,
}: {
  runId: string;
} & ObserveFlowRunCallbacks) {
  const supabase = createClient();
  
  console.log(`Setting up realtime subscription for flow run ${runId}`);

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

  const channelName = `flow_run_${runId}`;
  console.log(`Creating realtime channel: ${channelName}`);
  
  const realtimeChannel = supabase
    .channel(channelName)
    .on('postgres_changes', { ...updateEventSpec, table: 'runs' }, (payload) => {
      console.log(`[${channelName}] Received 'runs' UPDATE event:`, payload);
      onRunUpdate(payload);
    })
    .on(
      'postgres_changes',
      { ...updateEventSpec, table: 'step_states' },
      (payload) => {
        console.log(`[${channelName}] Received 'step_states' UPDATE event:`, payload);
        onStepStateUpdate(payload);
      }
    )
    .on(
      'postgres_changes' as any,
      { ...updateEventSpec, table: 'step_tasks' },
      (payload) => {
        console.log(`[${channelName}] Received 'step_tasks' UPDATE event:`, payload);
        onStepTaskUpdate(payload);
      }
    )
    // Also listen for INSERTs on step_tasks
    .on(
      'postgres_changes' as any,
      { ...insertEventSpec, table: 'step_tasks' },
      (payload) => {
        console.log(`[${channelName}] Received 'step_tasks' INSERT event:`, payload);
        onStepTaskInsert(payload);
      }
    );
    
  // Add subscription status callbacks
  realtimeChannel
    .on('connected', () => {
      console.log(`[${channelName}] Connected to realtime channel`);
    })
    .on('channel_error', (error) => {
      console.error(`[${channelName}] Channel error:`, error);
    });
  
  // Subscribe to the channel
  const subscription = realtimeChannel.subscribe((status) => {
    console.log(`[${channelName}] Subscription status:`, status);
  });

  return {
    unsubscribe: () => {
      console.log(`Unsubscribing from realtime channel: ${channelName}`);
      realtimeChannel.unsubscribe();
    },
  };
}
