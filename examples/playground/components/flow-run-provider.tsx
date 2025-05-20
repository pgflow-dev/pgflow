'use client';

import { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import {
  fetchFlowRunData,
  fetchOptimizedFlowRunData,
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
  
  // Cache for tracking summary and tags tasks to handle them together
  // This is the key for batching related tasks
  const pendingTwinTasksRef = useRef<Map<string, StepTaskRow>>(new Map());

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

  // Function to handle the twin tasks (summary and tags) together
  // This is key to solving the flicker issue by ensuring we batch updates
  const handleTwinTasks = (payload: StepTaskRow) => {
    logger.log(`Processing twin task ${payload.step_slug} with status ${payload.status}`);
    
    // Only proceed if this is a completed summary or tags task
    if (payload.status !== 'completed' || 
        (payload.step_slug !== 'summary' && payload.step_slug !== 'tags')) {
      return false; // Not a task we need to handle here
    }
    
    // Store this task in our pending map
    pendingTwinTasksRef.current.set(payload.step_slug, payload);
    
    // Get the other task (if summary, then check for tags and vice versa)
    const otherSlug = payload.step_slug === 'summary' ? 'tags' : 'summary';
    const otherTask = pendingTwinTasksRef.current.get(otherSlug);
    
    // Check if both tasks are now complete
    if (otherTask?.status === 'completed') {
      logger.log('Both summary and tags tasks are complete - updating state in a single batch');
      
      // Instead of fetching new data, work with what we have in our cache
      // Create an array with both tasks to ensure they're processed together
      const payloads = [payload, otherTask];
      
      // Use React's flushSync to force a single synchronous render
      flushSync(() => {
        // Apply all updates in one atomic operation
        setStepTasks(prevTasksMap => {
          // Create a copy of the current tasks map
          const newTasksMap = { ...prevTasksMap };
          
          // Process both tasks in a deterministic order
          payloads.forEach(task => {
            const stepSlug = task.step_slug;
            const existingTasks = newTasksMap[stepSlug] || [];
            
            // Find if this task already exists in our state
            const taskIndex = existingTasks.findIndex(
              t => t.run_id === task.run_id && t.step_slug === task.step_slug && 
                   (t.task_index || 0) === (task.task_index || 0)
            );
            
            // Add step_index from our map
            const enhancedTask = {
              ...task,
              step_index: stepOrderMap[task.step_slug] || 0,
            };
            
            // Update or add the task
            if (taskIndex >= 0) {
              // Replace existing task
              const updatedTasks = [...existingTasks];
              updatedTasks[taskIndex] = enhancedTask;
              newTasksMap[stepSlug] = updatedTasks;
            } else {
              // Add new task
              newTasksMap[stepSlug] = [...existingTasks, enhancedTask];
            }
          });
          
          // Apply order constraint to ensure tags comes before summary in the result array
          const taskOrder = { tags: 0, summary: 1 };
          
          // Create a special flat array for summary and tags for correct ordering
          let summarizedTasks: StepTaskRow[] = [];
          Object.entries(newTasksMap).forEach(([slug, tasks]) => {
            // Only modify the order of summary and tags tasks
            if (slug === 'summary' || slug === 'tags') {
              summarizedTasks = [...summarizedTasks, ...tasks];
            }
          });
          
          // Sort the summary and tags to enforce consistent order
          summarizedTasks.sort((a, b) => {
            // Use type-safe property access for the taskOrder object
            const aOrder = a.step_slug === 'tags' ? taskOrder.tags : 
                          a.step_slug === 'summary' ? taskOrder.summary : 99;
            const bOrder = b.step_slug === 'tags' ? taskOrder.tags : 
                          b.step_slug === 'summary' ? taskOrder.summary : 99;
            return aOrder - bOrder;
          });
          
          // Group them back into the map
          const orderedTaskMap: Record<string, StepTaskRow[]> = { ...newTasksMap };
          
          // Replace summary and tags entries with sorted versions
          summarizedTasks.forEach(task => {
            const slug = task.step_slug;
            if (!orderedTaskMap[slug]) {
              orderedTaskMap[slug] = [];
            }
            
            // Check if we need to add this task or if it's already there
            const existsAt = orderedTaskMap[slug].findIndex(
              t => t.run_id === task.run_id && t.step_slug === task.step_slug && 
                   (t.task_index || 0) === (task.task_index || 0)
            );
            
            if (existsAt === -1) {
              orderedTaskMap[slug].push(task);
            }
          });
          
          // Return the new deterministically ordered map
          return orderedTaskMap;
        });
      });
      
      // Clear the pending tasks
      pendingTwinTasksRef.current.clear();
      return true; // We've handled these tasks
    }
    
    return false; // Not yet ready to batch update
  };

  // Derive runData from the separate state pieces
  // This is critical to ensure UI stability - always maintain consistent ordering
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

    // Define a fixed and consistent order for summary and tags tasks
    // This is critical: tags MUST come before summary in all arrays
    const taskOrder = { tags: 0, summary: 1 };

    // First, separate summary and tags tasks from others for special handling
    const summaryTagsTasks: StepTaskRow[] = [];
    const otherTasks: StepTaskRow[] = [];
    
    // Process all task groups
    Object.entries(stepTasks).forEach(([slug, tasks]) => {
      tasks.forEach(task => {
        // Add step_index to each task for consistent sorting
        const enhancedTask = {
          ...task,
          step_index: stepOrderMap[task.step_slug] || 0,
        };
        
        if (slug === 'summary' || slug === 'tags') {
          // Special handling for summary and tags
          summaryTagsTasks.push(enhancedTask);
        } else {
          // Normal handling for other tasks
          otherTasks.push(enhancedTask);
        }
      });
    });
    
    // Sort summary and tags tasks by their fixed order first
    summaryTagsTasks.sort((a, b) => {
      // First by their mandated order (tags always before summary)
      const aOrder = a.step_slug === 'tags' ? taskOrder.tags : 
                    a.step_slug === 'summary' ? taskOrder.summary : 99;
      const bOrder = b.step_slug === 'tags' ? taskOrder.tags : 
                    b.step_slug === 'summary' ? taskOrder.summary : 99;
      const orderDiff = aOrder - bOrder;
      if (orderDiff !== 0) return orderDiff;
      
      // Then by task_index if needed
      const indexDiff = (a.task_index || 0) - (b.task_index || 0);
      if (indexDiff !== 0) return indexDiff;
      
      // Finally by attempts_count (descending) for retry stability
      return (b.attempts_count || 0) - (a.attempts_count || 0);
    });
    
    // Sort other tasks separately
    otherTasks.sort((a, b) => {
      // First by step_index
      const stepDiff = (a.step_index || 0) - (b.step_index || 0);
      if (stepDiff !== 0) return stepDiff;
      
      // Then by task_index
      const indexDiff = (a.task_index || 0) - (b.task_index || 0);
      if (indexDiff !== 0) return indexDiff;
      
      // Finally by attempts_count (descending) for retry stability
      return (b.attempts_count || 0) - (a.attempts_count || 0);
    });
    
    // Combine tasks: critical - put summary and tags FIRST to ensure they're rendered first
    const stepTasksArray = [...summaryTagsTasks, ...otherTasks];

    // Combine everything into ResultRow format
    return {
      ...run,
      step_states: stepStatesArray,
      step_tasks: stepTasksArray,
    } as ResultRow;
  }, [run, stepStates, stepTasks, stepOrderMap]);




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

      // Special handling for summary and tags tasks to prevent flickering and reordering
      // Try to handle as a twin task first (this is key for fixing the flicker)
      if (handleTwinTasks(payload.new)) {
        logger.log(`Task ${payload.new.step_slug} handled by twin tasks mechanism`);
        return; // Successfully handled by the twin task logic
      }
      
      // Standard handling for other tasks or when only one of summary/tags is complete
      const isSummaryOrTags = 
        payload.new.step_slug === 'summary' || 
        payload.new.step_slug === 'tags';
      
      if (isSummaryOrTags) {
        logger.log(`Important task updated - ${payload.new.step_slug}:`, {
          status: payload.new.status,
          has_output: !!payload.new.output,
          attempts_count: payload.new.attempts_count,
        });
      }

      // Standard handling for regular tasks or non-completed summary/tags
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

        // First, try to find a task with the same run_id, step_slug, and task_index
        // These fields together uniquely identify a task in the composite primary key
        // Default task_index to 0 if not available
        let taskIndex = currentTasks.findIndex(
          (task) => 
            task.run_id === newTask.run_id && 
            task.step_slug === newTask.step_slug && 
            (task.task_index || 0) === (newTask.task_index || 0)
        );
        
        // If task not found by exact match, check if it's a retry with matching run_id, step_slug, task_index
        // but different attempts_count - in this case, it's essentially the same task at a different stage
        if (taskIndex === -1 && isRetry) {
          // For retries, find the task with the same identifiers but potentially different attempts_count
          taskIndex = currentTasks.findIndex(
            (task) => 
              task.run_id === newTask.run_id &&
              task.step_slug === newTask.step_slug && 
              (task.task_index || 0) === (newTask.task_index || 0)
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
          
          // Always resort the tasks after an update to maintain consistent order
          updatedTasks.sort((a, b) => {
            // Primary sort by task_index
            const indexDiff = (a.task_index || 0) - (b.task_index || 0);
            if (indexDiff !== 0) return indexDiff;
            
            // Secondary sort by attempts_count (descending)
            return (b.attempts_count || 0) - (a.attempts_count || 0);
          });
          
          return {
            ...prevTasksMap,
            [stepSlug]: updatedTasks,
          };
        } else {
          // Task not found - add it (shouldn't happen with proper INSERT/UPDATE separation)
          logger.warn('Received UPDATE for non-existent task - adding it', newTask);
          
          // Add and sort to maintain consistent order
          const updatedTasks = [...currentTasks, newTask].sort((a, b) => {
            // Primary sort by task_index
            const indexDiff = (a.task_index || 0) - (b.task_index || 0);
            if (indexDiff !== 0) return indexDiff;
            
            // Secondary sort by attempts_count (descending)
            return (b.attempts_count || 0) - (a.attempts_count || 0);
          });
          
          return {
            ...prevTasksMap,
            [stepSlug]: updatedTasks,
          };
        }
      });
    };

    const handleStepTaskInsert = (
      payload: RealtimePostgresInsertPayload<StepTaskRow>,
    ) => {
      logger.log('Step task inserted:', payload);

      // Special handling for summary and tags tasks to prevent flickering and reordering
      // Try to handle as a twin task first (this is key for fixing the flicker)
      if (handleTwinTasks(payload.new)) {
        logger.log(`Task ${payload.new.step_slug} handled by twin tasks mechanism`);
        return; // Successfully handled by the twin task logic
      }
      
      // Standard handling for other tasks or when only one of summary/tags is complete
      const isSummaryOrTags = 
        payload.new.step_slug === 'summary' || 
        payload.new.step_slug === 'tags';
      
      if (isSummaryOrTags) {
        logger.log(`Important task inserted - ${payload.new.step_slug}:`, {
          status: payload.new.status,
          has_output: !!payload.new.output,
          attempts_count: payload.new.attempts_count,
        });
      }

      // Standard handler for normal tasks or non-completed summary/tags tasks
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
                    run_id: task.run_id,
                    step_slug: task.step_slug,
                    task_index: task.task_index,
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

        // For status changes but not completion, fetch fresh data with optimized query
        // This ensures we have the latest task states but without the full output blobs
        if (payload.old && payload.new.status !== payload.old.status) {
          logger.log('Run status changed, fetching optimized data');
          fetchOptimizedFlowRunData(runId).then(({ data, error }) => {
            if (error) {
              logger.error('Error fetching optimized run data during status update:', error);
              // Fall back to just updating the run data directly
              setRun(payload.new);
            } else if (data) {
              logger.log('Updated with optimized run data after status change');
              // Update the run data directly from the payload as it's faster
              setRun({
                ...data,
                step_states: undefined,
                step_tasks: undefined,
              } as RunRow);
              
              // Then update step states and tasks from the optimized data
              if (data.step_states?.length) {
                // Convert step states array to a map
                const stateMap: Record<string, StepStateRow> = {};
                data.step_states.forEach((state) => {
                  stateMap[state.step_slug] = state;
                });
                setStepStates(stateMap);
              }
              
              if (data.step_tasks?.length) {
                // Group step tasks by step_slug
                const tasksMap: Record<string, StepTaskRow[]> = {};
                data.step_tasks.forEach((task) => {
                  const taskWithIndex = {
                    ...task,
                    step_index: stepOrderMap[task.step_slug] || 0,
                  };
                  if (!tasksMap[task.step_slug]) {
                    tasksMap[task.step_slug] = [];
                  }
                  tasksMap[task.step_slug].push(taskWithIndex);
                });
                setStepTasks(tasksMap);
              }
            }
          });
        } else {
          // For minor updates, just update the run status directly
          setRun(payload.new);
        }
        
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
      // For initial load, use full data query to get complete information
      logger.log('Initial load: Fetching full data');
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
              run_id: task.run_id,
              task_index: task.task_index,
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
