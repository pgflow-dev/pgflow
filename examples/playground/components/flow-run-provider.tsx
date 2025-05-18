'use client';

import { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import {
  fetchFlowRunData,
  observeFlowRun,
  ResultRow,
  RunRow,
  StepStateRow,
  StepTaskRow,
} from '@/lib/db';
import {
  RealtimePostgresUpdatePayload,
  RealtimePostgresInsertPayload,
} from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/browser-client';
import { useLoadingState } from './loading-state-provider';
import { logger } from '@/utils/utils';

interface FlowRunContextType {
  runData: ResultRow | null;
  loading: boolean;
  error: string | null;
  // No longer passing a Date object to avoid re-renders
  analyzeWebsite: (url: string) => Promise<void>;
  analyzeLoading: boolean;
  analyzeError: string | null;
}

const FlowRunContext = createContext<FlowRunContextType>({
  runData: null,
  loading: true,
  error: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  analyzeWebsite: async () => {},
  analyzeLoading: false,
  analyzeError: null,
});

export const useFlowRun = () => useContext(FlowRunContext);

interface FlowRunProviderProps {
  runId: string;
  children: React.ReactNode;
}

export function FlowRunProvider({ runId, children }: FlowRunProviderProps) {
  // Split the state into separate pieces
  const [run, setRun] = useState<RunRow | null>(null);
  const [stepStates, setStepStates] = useState<Record<string, StepStateRow>>(
    {},
  );
  const [stepTasks, setStepTasks] = useState<Record<string, StepTaskRow[]>>({});

  // Create a persistent mapping of step_slug to step_index
  // This is cached once when the data is loaded and never changes
  const [stepOrderMap, setStepOrderMap] = useState<Record<string, number>>({});

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // No longer need currentTime state that causes re-renders
  // Components will calculate relative times on-demand using Date.now()

  const router = useRouter();
  const supabase = createClient();
  const { setLoading: setGlobalLoading } = useLoadingState();
  
  // Use the shared hook for starting analysis
  const { start: analyzeWebsite, isPending: analyzeLoading, error: analyzeError } = useStartAnalysis();

  // Derive runData from the separate state pieces
  const runData = useMemo<ResultRow | null>(() => {
    if (!run) return null;

    // Convert stepStates map to array
    const stepStatesArray = Object.values(stepStates);

    // Sort stepStatesArray using our permanent stepOrderMap
    stepStatesArray.sort((a, b) => {
      const aIndex = stepOrderMap[a.step_slug] || 0;
      const bIndex = stepOrderMap[b.step_slug] || 0;
      return aIndex - bIndex;
    });

    // Create a flat array of all step tasks
    const stepTasksArray = Object.values(stepTasks)
      .flat()
      .map((task) => {
        // Add step_index to each task for consistent sorting using our cached map
        return {
          ...task,
          step_index: stepOrderMap[task.step_slug] || 0,
        };
      });

    // Sort the step tasks using the step_index from our cached map
    stepTasksArray.sort((a, b) => {
      return (
        (stepOrderMap[a.step_slug] || 0) - (stepOrderMap[b.step_slug] || 0)
      );
    });

    // Combine everything into ResultRow format
    return {
      ...run,
      step_states: stepStatesArray,
      step_tasks: stepTasksArray,
    } as ResultRow;
  }, [run, stepStates, stepTasks]);




  useEffect(() => {
    if (!runId) return;
    
    setLoading(true);
    // Set global loading state to true when initially loading run data
    // It will be set to false when we detect a completed/failed state
    setGlobalLoading(true);

    // Set up handlers for real-time updates
    const handleStepStateUpdate = (
      payload: RealtimePostgresUpdatePayload<StepStateRow>,
    ) => {
      logger.log('Step state updated:', payload);

      // When step state is updated, we don't need to preserve step_index anymore
      // because we have our cached stepOrderMap
      const updatedStepState = payload.new;

      setStepStates((prevStates) => ({
        ...prevStates,
        [updatedStepState.step_slug]: updatedStepState,
      }));
    };

    const handleStepTaskUpdate = (
      payload: RealtimePostgresUpdatePayload<StepTaskRow>,
    ) => {
      logger.log('Step task updated:', payload);

      // Log important details about the updated task
      if (
        payload.new.step_slug === 'summary' ||
        payload.new.step_slug === 'tags'
      ) {
        logger.log(`Important task updated - ${payload.new.step_slug}:`, {
          status: payload.new.status,
          has_output: !!payload.new.output,
          attempts_count: payload.new.attempts_count,
        });
      }

      // Check if this is a retry (attempts_count > 1)
      const isRetry = payload.new.attempts_count && payload.new.attempts_count > 1;
      if (isRetry) {
        logger.log(`Task is being retried - attempt ${payload.new.attempts_count}`, payload.new);
      }

      // Add step_index to the task from our cached stepOrderMap
      const newTask = {
        ...payload.new,
        step_index: stepOrderMap[payload.new.step_slug] || 0,
      };

      setStepTasks((prevTasksMap) => {
        const stepSlug = newTask.step_slug;
        const currentTasks = prevTasksMap[stepSlug] || [];

        // First, try to find a task with the same ID
        let taskIndex = currentTasks.findIndex(
          (task) => task.step_task_id === newTask.step_task_id
        );
        
        // If we have a retry (attempts_count > 1), find any previous attempt with the same step_slug
        // but fewer attempts to replace it with the latest attempt
        if (taskIndex === -1 && isRetry) {
          // Look for a previous attempt with the same task slug but lower attempts_count
          taskIndex = currentTasks.findIndex(
            (task) => 
              task.step_slug === newTask.step_slug && 
              (!task.attempts_count || (task.attempts_count < newTask.attempts_count))
          );
          
          if (taskIndex !== -1) {
            logger.log('Found previous attempt to update with newer attempt', {
              oldAttempt: currentTasks[taskIndex].attempts_count, 
              newAttempt: newTask.attempts_count
            });
          }
        }

        if (taskIndex >= 0) {
          // Update existing task
          const updatedTasks = [...currentTasks];
          updatedTasks[taskIndex] = newTask;
          return {
            ...prevTasksMap,
            [stepSlug]: updatedTasks,
          };
        } else {
          // Task not found - add it (shouldn't happen with proper INSERT/UPDATE separation)
          logger.warn('Received UPDATE for non-existent task - adding it', newTask);
          return {
            ...prevTasksMap,
            [stepSlug]: [...currentTasks, newTask],
          };
        }
      });
    };

    const handleStepTaskInsert = (
      payload: RealtimePostgresInsertPayload<StepTaskRow>,
    ) => {
      logger.log('Step task inserted:', payload);

      // Log important details about the new task
      if (
        payload.new.step_slug === 'summary' ||
        payload.new.step_slug === 'tags'
      ) {
        logger.log(`Important task inserted - ${payload.new.step_slug}:`, {
          status: payload.new.status,
          has_output: !!payload.new.output,
          attempts_count: payload.new.attempts_count,
        });
      }

      // Check if this is a retry (attempts_count > 1)
      const isRetry = payload.new.attempts_count && payload.new.attempts_count > 1;
      if (isRetry) {
        logger.log(`New task is a retry - attempt ${payload.new.attempts_count}`, payload.new);
      }

      // Add step_index to the task from our cached stepOrderMap
      const newTask = {
        ...payload.new,
        step_index: stepOrderMap[payload.new.step_slug] || 0,
      };

      setStepTasks((prevTasksMap) => {
        const stepSlug = newTask.step_slug;
        const currentTasks = prevTasksMap[stepSlug] || [];

        return {
          ...prevTasksMap,
          [stepSlug]: [...currentTasks, newTask],
        };
      });
    };

    // Set up a subscription to get real-time updates
    const subscription = observeFlowRun({
      runId,
      onRunUpdate(payload: RealtimePostgresUpdatePayload<RunRow>) {
        logger.log('Run updated:', payload);

        // Check if the run has reached a terminal state
        const isTerminalState = ['completed', 'failed', 'error', 'cancelled'].includes(payload.new.status);

        // When run is marked as completed, fetch all data again to ensure we have all step outputs
        if (payload.new.status === 'completed') {
          logger.log(
            'Run completed - fetching full data to ensure we have all step outputs',
          );

          // Set global loading state to false when the run completes
          setGlobalLoading(false);

          // Fetch fresh data from API
          fetchFlowRunData(runId).then(({ data, error }) => {
            if (error) {
              logger.error('Error fetching complete run data:', error);
            } else if (data) {
              logger.log('Fetched complete run data:', data);
              // Update all state pieces with fresh data
              setRun({
                ...data,
                step_states: undefined,
                step_tasks: undefined,
              } as RunRow);

              // Convert step states array to a map
              const stateMap: Record<string, StepStateRow> = {};
              data.step_states.forEach((state) => {
                stateMap[state.step_slug] = state;
              });
              setStepStates(stateMap);

              // Group step tasks by step_slug and add step_index from our cached stepOrderMap
              const tasksMap: Record<string, StepTaskRow[]> = {};
              data.step_tasks.forEach((task) => {
                // Add step_index to task using our cached stepOrderMap
                const taskWithIndex = {
                  ...task,
                  step_index: stepOrderMap[task.step_slug] || 0,
                };
                
                // Log if this task has been retried (attempts_count > 1)
                if (task.attempts_count && task.attempts_count > 1) {
                  logger.log(`Complete run data: Found retry for task - attempt ${task.attempts_count}`, {
                    step_slug: task.step_slug,
                    step_task_id: task.step_task_id,
                    status: task.status
                  });
                }

                if (!tasksMap[task.step_slug]) {
                  tasksMap[task.step_slug] = [];
                }
                tasksMap[task.step_slug].push(taskWithIndex);
              });
              setStepTasks(tasksMap);
              
              // Unsubscribe from Supabase channel since we have all data and the run is complete
              subscription.unsubscribe();
              logger.log('Unsubscribed from realtime updates as run is complete');
            }
          });

          return;
        }

        // For other updates, update only the run data
        setRun(payload.new);
        
        // Turn off loading if the run fails
        if (payload.new.status === 'failed' || payload.new.status === 'error' || payload.new.status === 'cancelled') {
          setGlobalLoading(false);
          
          // Unsubscribe from Supabase channel for failed/error/cancelled states too
          subscription.unsubscribe();
          logger.log(`Unsubscribed from realtime updates as run is in terminal state: ${payload.new.status}`);
        }
      },
      onStepStateUpdate: handleStepStateUpdate,
      onStepTaskUpdate: handleStepTaskUpdate,
      onStepTaskInsert: handleStepTaskInsert,
    });

    // No more interval for updating currentTime
    // This removes the source of continuous re-renders

    // Load data after subscription is set up to avoid race conditions
    const loadData = async () => {      
      const { data, error } = await fetchFlowRunData(runId);

      if (error) {
        setError(error);
        setGlobalLoading(false);
      } else if (data) {
        // Initialize our separate state pieces from the fetched data
        setRun({
          ...data,
          step_states: undefined,
          step_tasks: undefined,
        } as RunRow);

        // If the run is already in a terminal state (completed/failed/error/cancelled)
        const isTerminalState = ['completed', 'failed', 'error', 'cancelled'].includes(data.status);
        if (isTerminalState) {
          setGlobalLoading(false);
          
          // Unsubscribe from realtime updates for already completed runs
          // We can do this safely within loadData since the subscription is created before this
          subscription.unsubscribe();
          logger.log(`Initial data load: Unsubscribed from realtime updates as run is already in terminal state: ${data.status}`);
        }

        // Create and cache the step order map from step_states
        // This is created once and never changes, ensuring consistent ordering
        const orderMap: Record<string, number> = {};
        data.step_states.forEach((state) => {
          if (state.step && state.step_slug) {
            orderMap[state.step_slug] = state.step.step_index || 0;
          }
        });
        setStepOrderMap(orderMap);

        // Convert step states array to a map keyed by step_slug
        const stateMap: Record<string, StepStateRow> = {};
        data.step_states.forEach((state) => {
          stateMap[state.step_slug] = state;
        });
        setStepStates(stateMap);

        // Group step tasks by step_slug
        const tasksMap: Record<string, StepTaskRow[]> = {};
        data.step_tasks.forEach((task) => {
          // Add step_index to task for consistent ordering
          const taskWithIndex = {
            ...task,
            step_index: orderMap[task.step_slug] || 0,
          };

          // Log if this task has been retried (attempts_count > 1)
          if (task.attempts_count && task.attempts_count > 1) {
            logger.log(`Initial load: Found retry for task - attempt ${task.attempts_count}`, {
              step_slug: task.step_slug,
              step_task_id: task.step_task_id,
              status: task.status
            });
          }

          if (!tasksMap[task.step_slug]) {
            tasksMap[task.step_slug] = [];
          }
          tasksMap[task.step_slug].push(taskWithIndex);
        });
        setStepTasks(tasksMap);
      }

      setLoading(false);
    };

    // Load data after subscription is ready
    loadData();

    return () => {
      subscription.unsubscribe();
      // No more timer to clear
    };
  }, [runId, router]);

  const value = {
    runData,
    loading,
    error,
    // currentTime removed to avoid re-renders
    analyzeWebsite,
    analyzeLoading,
    analyzeError,
  };

  return (
    <FlowRunContext.Provider value={value}>{children}</FlowRunContext.Provider>
  );
}
