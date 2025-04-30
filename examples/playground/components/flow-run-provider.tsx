'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchFlowRunData,
  observeFlowRun,
  ResultRow,
  RunRow,
  StepStateRow,
  StepTaskRow,
} from '@/lib/db';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface FlowRunContextType {
  runData: ResultRow | null;
  loading: boolean;
  error: string | null;
  currentTime: Date;
  analyzeWebsite: (url: string) => void;
}

const FlowRunContext = createContext<FlowRunContextType>({
  runData: null,
  loading: true,
  error: null,
  currentTime: new Date(),
  analyzeWebsite: () => {},
});

export const useFlowRun = () => useContext(FlowRunContext);

interface FlowRunProviderProps {
  runId: string;
  children: React.ReactNode;
}

export function FlowRunProvider({ runId, children }: FlowRunProviderProps) {
  const [runData, setRunData] = useState<ResultRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const router = useRouter();

  // Function to analyze a new website
  const analyzeWebsite = (url: string) => {
    // Redirect to the website analyzer with the URL
    router.push(`/websites?url=${encodeURIComponent(url)}`);
  };

  useEffect(() => {
    const loadData = async () => {
      if (!runId) return;

      setLoading(true);
      const { data, error } = await fetchFlowRunData(runId);

      if (error) {
        setError(error);
      } else if (data) {
        setRunData(data);
      }

      setLoading(false);
    };

    loadData();

    // Set up handlers for real-time updates
    const handleStepStateUpdate = (
      payload: RealtimePostgresChangesPayload<StepStateRow>,
    ) => {
      console.log('Step state updated:', payload);

      setRunData((prevData) => {
        if (!prevData) return null;

        // Find the index of the updated step state
        const stepStateIndex = prevData.step_states.findIndex(
          (step) => step.step_slug === payload.new.step_slug,
        );

        // Create a new array of step states with the updated one
        const updatedStepStates = [...prevData.step_states];

        if (stepStateIndex !== -1) {
          // Update existing step state
          updatedStepStates[stepStateIndex] = payload.new;
        } else if (payload.eventType === 'INSERT') {
          // Add new step state
          updatedStepStates.push(payload.new);
        }

        // Create a mapping of step_slug to step_index to maintain order
        const stepIndexMap = new Map<string, number>();
        updatedStepStates.forEach((state) => {
          if (state.step && state.step_slug) {
            stepIndexMap.set(state.step_slug, state.step?.step_index || 0);
          }
        });

        // Sort the updated step states using the mapping
        updatedStepStates.sort((a, b) => {
          const aIndex = stepIndexMap.get(a.step_slug) || 0;
          const bIndex = stepIndexMap.get(b.step_slug) || 0;
          return aIndex - bIndex;
        });

        // Return the updated data
        return {
          ...prevData,
          step_states: updatedStepStates,
        } as ResultRow;
      });
    };

    const handleStepTaskUpdate = (
      payload: RealtimePostgresChangesPayload<StepTaskRow>,
    ) => {
      console.log('Step task updated:', payload);

      setRunData((prevData) => {
        if (!prevData) return null;

        // Find the index of the updated step task
        const stepTaskIndex = prevData.step_tasks.findIndex(
          (task) => task.step_slug === payload.new.step_slug,
        );

        // Create a new array of step tasks with the updated one
        const updatedStepTasks = [...prevData.step_tasks];

        if (stepTaskIndex !== -1) {
          // Update existing step task
          updatedStepTasks[stepTaskIndex] = payload.new;
        } else if (payload.eventType === 'INSERT') {
          // Add new step task
          updatedStepTasks.push(payload.new);
        }

        // Create a mapping of step_slug to step_index from step_states to maintain order
        const stepIndexMap = new Map<string, number>();
        prevData.step_states.forEach((state) => {
          if (state.step && state.step_slug) {
            stepIndexMap.set(state.step_slug, state.step?.step_index || 0);
          }
        });

        // Sort the updated step tasks using the mapping
        updatedStepTasks.sort((a, b) => {
          const aIndex = stepIndexMap.get(a.step_slug) || 0;
          const bIndex = stepIndexMap.get(b.step_slug) || 0;
          return aIndex - bIndex;
        });

        // Return the updated data
        return {
          ...prevData,
          step_tasks: updatedStepTasks,
        } as ResultRow;
      });
    };

    // Set up a subscription to get real-time updates
    const subscription = observeFlowRun({
      runId,
      onRunUpdate(payload: RealtimePostgresChangesPayload<RunRow>) {
        console.log('Run updated:', payload);

        // Update only the run data without refetching everything
        setRunData((prevData) => {
          if (!prevData) return null;

          // Create a new object with the updated run data
          return {
            ...prevData,
            ...payload.new,
          } as ResultRow;
        });
      },
      onStepStateUpdate: handleStepStateUpdate,
      onStepTaskUpdate: handleStepTaskUpdate,
    });

    // Set up a timer to update the current time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

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
  };

  return (
    <FlowRunContext.Provider value={value}>{children}</FlowRunContext.Provider>
  );
}
