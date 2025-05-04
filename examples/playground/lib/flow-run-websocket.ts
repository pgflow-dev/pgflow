'use client';

import { createClient } from '@/utils/supabase/client';
import { RealtimePostgresUpdatePayload, RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { queryClient } from './query-client';
import { ResultRow, RunRow, StepStateRow, StepTaskRow, fetchFlowRunData } from './db';

// Track active subscriptions to avoid duplicates
const activeSubscriptions = new Map<string, {
  runId: string;
  unsubscribe: () => void;
  refCount: number;
}>();

/**
 * Subscribe to realtime updates for a flow run
 * Returns an unsubscribe function
 */
export function subscribeToFlowRun(runId: string): () => void {
  // Check if we already have an active subscription
  const existingSubscription = activeSubscriptions.get(runId);
  
  if (existingSubscription) {
    // Increment reference count
    existingSubscription.refCount++;
    
    // Return unsubscribe function that decrements reference count
    return () => {
      const subscription = activeSubscriptions.get(runId);
      if (!subscription) return;
      
      subscription.refCount--;
      
      // If no more references, unsubscribe and remove
      if (subscription.refCount <= 0) {
        subscription.unsubscribe();
        activeSubscriptions.delete(runId);
        console.log(`Removed subscription to flow run ${runId}`);
      }
    };
  }
  
  console.log(`Setting up new subscription for flow run ${runId}`);
  const supabase = createClient();

  // Set up Supabase realtime channel
  const channel = supabase
    .channel(`flow_run_${runId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'pgflow',
        table: 'runs',
        filter: `run_id=eq.${runId}`,
      },
      (payload: RealtimePostgresUpdatePayload<RunRow>) => {
        console.log('Realtime: Run updated', payload);
        handleRunUpdate(runId, payload);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'pgflow',
        table: 'step_states',
        filter: `run_id=eq.${runId}`,
      },
      (payload: RealtimePostgresUpdatePayload<StepStateRow>) => {
        console.log('Realtime: Step state updated', payload);
        handleStepStateUpdate(runId, payload);
      }
    )
    .on(
      'postgres_changes' as any,
      {
        event: 'UPDATE',
        schema: 'pgflow',
        table: 'step_tasks',
        filter: `run_id=eq.${runId}`,
      },
      (payload: RealtimePostgresUpdatePayload<StepTaskRow>) => {
        console.log('Realtime: Step task updated', payload);
        handleStepTaskUpdate(runId, payload);
      }
    )
    .on(
      'postgres_changes' as any,
      {
        event: 'INSERT',
        schema: 'pgflow',
        table: 'step_tasks',
        filter: `run_id=eq.${runId}`,
      },
      (payload: RealtimePostgresInsertPayload<StepTaskRow>) => {
        console.log('Realtime: Step task inserted', payload);
        handleStepTaskInsert(runId, payload);
      }
    );

  // Subscribe to the channel
  channel.subscribe((status) => {
    console.log(`Subscription status for flow run ${runId}:`, status);
  });

  // Store the subscription
  const subscription = {
    runId,
    unsubscribe: () => {
      console.log(`Unsubscribing from flow run ${runId}`);
      channel.unsubscribe();
    },
    refCount: 1,
  };

  activeSubscriptions.set(runId, subscription);

  // Return unsubscribe function
  return () => {
    const sub = activeSubscriptions.get(runId);
    if (!sub) return;
    
    sub.refCount--;
    
    if (sub.refCount <= 0) {
      sub.unsubscribe();
      activeSubscriptions.delete(runId);
      console.log(`Removed subscription to flow run ${runId}`);
    }
  };
}

/**
 * Handle run updates
 */
async function handleRunUpdate(runId: string, payload: RealtimePostgresUpdatePayload<RunRow>): Promise<void> {
  // Get current data from cache
  const queryKey = ['flowRun', runId];
  const currentData = queryClient.getQueryData<ResultRow>(queryKey);
  
  if (!currentData) {
    console.log('No cached data found for run update, refetching');
    queryClient.invalidateQueries({ queryKey });
    return;
  }

  // If run is completed, refetch all data to ensure we have everything
  if (payload.new.status === 'completed') {
    console.log('Run completed, invalidating query to refetch all data');
    
    // Force an immediate synchronous refetch 
    try {
      const { data, error } = await fetchFlowRunData(runId);
      if (data && !error) {
        console.log('Successfully fetched final data for completed run');
        queryClient.setQueryData(queryKey, data);
        
        // Force another update to ensure components re-render
        setTimeout(() => {
          queryClient.setQueryData(queryKey, {...data});
        }, 50);
      } else {
        // Fallback to normal invalidation
        queryClient.invalidateQueries({ queryKey });
      }
    } catch (e) {
      console.error('Error fetching complete run data:', e);
      queryClient.invalidateQueries({ queryKey });
    }
    
    return;
  }

  // Otherwise, update the run data in the cache
  const updatedData: ResultRow = {
    ...currentData,
    ...payload.new,
  };

  console.log('Updating run data in cache:', updatedData);
  queryClient.setQueryData(queryKey, updatedData);
  
  // Force a refetch to ensure components update
  // This is important because sometimes React Query doesn't detect deep changes
  queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
  
  // Alternative approach: For UI to react properly, we need to trigger observers
  // by forcing a cache update with structurally different but logically equivalent data
  setTimeout(() => {
    const latestData = queryClient.getQueryData<ResultRow>(queryKey);
    if (latestData) {
      // Create a new object with the same data to force React Query to notify subscribers
      queryClient.setQueryData(queryKey, {...latestData});
    }
  }, 10);
}

/**
 * Handle step state updates
 */
function handleStepStateUpdate(runId: string, payload: RealtimePostgresUpdatePayload<StepStateRow>): void {
  const queryKey = ['flowRun', runId];
  const currentData = queryClient.getQueryData<ResultRow>(queryKey);
  
  if (!currentData) {
    console.log('No cached data found for step state update, refetching');
    queryClient.invalidateQueries({ queryKey });
    return;
  }

  // Get updated step states
  const stepStates = [...currentData.step_states];
  const stepIndex = stepStates.findIndex(s => s.step_slug === payload.new.step_slug);
  
  if (stepIndex >= 0) {
    stepStates[stepIndex] = payload.new;
  } else {
    stepStates.push(payload.new);
  }

  // Create updated data object - create a new object to ensure React Query detects the change
  const updatedData = {
    ...currentData,
    step_states: stepStates,
  };

  // Update the cache
  console.log('Updating step state in cache:', payload.new);
  queryClient.setQueryData(queryKey, updatedData);
  
  // Force a refetch to ensure components update
  queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
  
  // Alternative approach: For UI to react properly, we need to trigger observers
  // by forcing a cache update with structurally different but logically equivalent data
  setTimeout(() => {
    const latestData = queryClient.getQueryData<ResultRow>(queryKey);
    if (latestData) {
      // Create a new object with the same data to force React Query to notify subscribers
      queryClient.setQueryData(queryKey, {...latestData});
    }
  }, 10);
}

/**
 * Handle step task updates
 */
function handleStepTaskUpdate(runId: string, payload: RealtimePostgresUpdatePayload<StepTaskRow>): void {
  const queryKey = ['flowRun', runId];
  const currentData = queryClient.getQueryData<ResultRow>(queryKey);
  
  if (!currentData) {
    console.log('No cached data found for step task update, refetching');
    queryClient.invalidateQueries({ queryKey });
    return;
  }

  // Get updated step tasks
  const stepTasks = [...currentData.step_tasks];
  const taskIndex = stepTasks.findIndex(t => t.id === payload.new.id);
  
  if (taskIndex >= 0) {
    stepTasks[taskIndex] = payload.new;
  } else {
    stepTasks.push(payload.new);
  }

  // Create updated data object - create a new object to ensure React Query detects the change
  const updatedData = {
    ...currentData,
    step_tasks: stepTasks,
  };

  // Update the cache
  console.log('Updating step task in cache:', payload.new);
  queryClient.setQueryData(queryKey, updatedData);
  
  // Force a refetch to ensure components update
  queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
  
  // Alternative approach: For UI to react properly, we need to trigger observers
  // by forcing a cache update with structurally different but logically equivalent data
  setTimeout(() => {
    const latestData = queryClient.getQueryData<ResultRow>(queryKey);
    if (latestData) {
      // Create a new object with the same data to force React Query to notify subscribers
      queryClient.setQueryData(queryKey, {...latestData});
    }
  }, 10);
}

/**
 * Handle step task insertions
 */
function handleStepTaskInsert(runId: string, payload: RealtimePostgresInsertPayload<StepTaskRow>): void {
  const queryKey = ['flowRun', runId];
  const currentData = queryClient.getQueryData<ResultRow>(queryKey);
  
  if (!currentData) {
    console.log('No cached data found for step task insert, refetching');
    queryClient.invalidateQueries({ queryKey });
    return;
  }

  // Create updated data with the new task
  const updatedData = {
    ...currentData,
    step_tasks: [...currentData.step_tasks, payload.new],
  };

  // Update the cache
  console.log('Inserting step task in cache:', payload.new);
  queryClient.setQueryData(queryKey, updatedData);
  
  // This is important - we need to force a refetch
  queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
  
  // Alternative approach: For UI to react properly, we need to trigger observers
  // by forcing a cache update with structurally different but logically equivalent data
  setTimeout(() => {
    const latestData = queryClient.getQueryData<ResultRow>(queryKey);
    if (latestData) {
      // Create a new object with the same data to force React Query to notify subscribers
      queryClient.setQueryData(queryKey, {...latestData});
    }
  }, 10);
}