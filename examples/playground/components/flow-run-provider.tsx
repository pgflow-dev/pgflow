'use client';

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
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
import { createClient } from '@/utils/supabase/client';
import { useLoadingState } from './loading-state-provider';

interface FlowRunContextType {
  runData: ResultRow | null;
  loading: boolean;
  error: string | null;
  currentTime: Date;
  analyzeWebsite: (url: string) => Promise<void>;
  analyzeLoading: boolean;
  analyzeError: string | null;
}

const FlowRunContext = createContext<FlowRunContextType>({
  runData: null,
  loading: true,
  error: null,
  currentTime: new Date(),
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
  // Single source of truth for run data
  const [runData, setRunData] = useState<ResultRow | null>(null);
  
  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const router = useRouter();
  const supabase = createClient();
  const { setLoading: setGlobalLoading } = useLoadingState();
  
  // Use the shared hook for starting analysis
  const { start: analyzeWebsite, isPending: analyzeLoading, error: analyzeError } = useStartAnalysis();




  useEffect(() => {
    if (!runId) return;
    
    setLoading(true);
    // Set global loading state to true when initially loading run data
    // It will be set to false when we detect a completed/failed state
    setGlobalLoading(true);

    // Helper function to update a single step state in runData
    const updateStepState = (updatedStepState: StepStateRow) => {
      setRunData((prevData) => {
        if (!prevData) return null;
        
        const updatedStepStates = prevData.step_states.map((state) =>
          state.step_slug === updatedStepState.step_slug ? updatedStepState : state
        );
        
        return {
          ...prevData,
          step_states: updatedStepStates,
        };
      });
    };

    // Helper function to update or insert a step task in runData
    const updateStepTask = (newTask: StepTaskRow) => {
      setRunData((prevData) => {
        if (!prevData) return null;
        
        const existingTaskIndex = prevData.step_tasks.findIndex(
          (task) => task.step_slug === newTask.step_slug
        );
        
        let updatedStepTasks;
        if (existingTaskIndex >= 0) {
          // Update existing task
          updatedStepTasks = [...prevData.step_tasks];
          updatedStepTasks[existingTaskIndex] = newTask;
        } else {
          // Add new task
          updatedStepTasks = [...prevData.step_tasks, newTask];
        }
        
        return {
          ...prevData,
          step_tasks: updatedStepTasks,
        };
      });
    };

    // Set up handlers for real-time updates
    const handleStepStateUpdate = (
      payload: RealtimePostgresUpdatePayload<StepStateRow>,
    ) => {
      console.log('Step state updated:', payload);
      updateStepState(payload.new);
    };

    const handleStepTaskUpdate = (
      payload: RealtimePostgresUpdatePayload<StepTaskRow>,
    ) => {
      // Log appropriately for INSERT or UPDATE event
      const isInsert = !payload.old;
      console.log(`Step task ${isInsert ? 'created' : 'updated'}:`, payload);

      // Log important details about the new task
      if (
        payload.new.step_slug === 'summary' ||
        payload.new.step_slug === 'tags'
      ) {
        console.log(`Important task updated - ${payload.new.step_slug}:`, {
          status: payload.new.status,
          has_output: !!payload.new.output,
          output: payload.new.output,
        });
      }

      updateStepTask(payload.new);
    };

    const handleStepTaskInsert = (
      payload: RealtimePostgresInsertPayload<StepTaskRow>,
    ) => {
      console.log('Step task inserted:', payload);

      // Log important details about the new task
      if (
        payload.new.step_slug === 'summary' ||
        payload.new.step_slug === 'tags'
      ) {
        console.log(`Important task inserted - ${payload.new.step_slug}:`, {
          status: payload.new.status,
          has_output: !!payload.new.output,
        });
      }

      updateStepTask(payload.new);
    };

    // Set up a subscription to get real-time updates
    const subscription = observeFlowRun({
      runId,
      onRunUpdate(payload: RealtimePostgresUpdatePayload<RunRow>) {
        console.log('Run updated:', payload);

        // When run is marked as completed, fetch all data again to ensure we have all step outputs
        if (payload.new.status === 'completed') {
          console.log(
            'Run completed - fetching full data to ensure we have all step outputs',
          );

          // Set global loading state to false when the run completes
          setGlobalLoading(false);

          // Fetch fresh data from API
          fetchFlowRunData(runId).then(({ data, error }) => {
            if (error) {
              console.error('Error fetching complete run data:', error);
            } else if (data) {
              console.log('Fetched complete run data:', data);
              // Update the single source of truth atomically
              setRunData(data);
            }
          });

          return;
        }

        // For other updates, update the run data directly
        setRunData((prevData) => {
          if (!prevData) return null;
          return {
            ...prevData,
            ...payload.new,
          };
        });
        
        // Turn off loading if the run fails
        if (payload.new.status === 'failed' || payload.new.status === 'error' || payload.new.status === 'cancelled') {
          setGlobalLoading(false);
        }
      },
      onStepStateUpdate: handleStepStateUpdate,
      onStepTaskUpdate: handleStepTaskUpdate,
      onStepTaskInsert: handleStepTaskInsert,
    });

    // Set up a timer to update the current time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Load data after subscription is set up to avoid race conditions
    const loadData = async () => {      
      const { data, error } = await fetchFlowRunData(runId);

      if (error) {
        setError(error);
        setGlobalLoading(false);
      } else if (data) {
        // Set the single source of truth
        setRunData(data);

        // If the run is already completed, turn off the global loading state
        if (data.status === 'completed' || data.status === 'failed' || 
            data.status === 'error' || data.status === 'cancelled') {
          setGlobalLoading(false);
        }
      }

      setLoading(false);
    };

    // Load data after subscription is ready
    loadData();

    return () => {
      subscription.unsubscribe();
      clearInterval(timer);
    };
  }, [runId, router]);

  const value = {
    runData,
    loading,
    error,
    currentTime,
    analyzeWebsite,
    analyzeLoading,
    analyzeError,
  };

  return (
    <FlowRunContext.Provider value={value}>{children}</FlowRunContext.Provider>
  );
}
