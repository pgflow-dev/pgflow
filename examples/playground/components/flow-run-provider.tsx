'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { useFlowRun, useStartFlowRun } from '@/lib/use-flow-run';
import { ResultRow } from '@/lib/db';

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
  analyzeWebsite: async () => { },
  analyzeLoading: false,
  analyzeError: null,
});

export const useFlowRun = () => useContext(FlowRunContext);

interface FlowRunProviderProps {
  runId: string;
  children: React.ReactNode;
}

export function FlowRunProvider({ runId, children }: FlowRunProviderProps) {
  // Use our custom hooks to fetch data and manage realtime updates
  const { runData: rawRunData, loading, error, currentTime } = useFlowRun(runId);
  const { analyzeWebsite, analyzeLoading, analyzeError } = useStartFlowRun();
  
  // Ensure we have a valid runData object with required properties
  const runData = useMemo(() => {
    if (!rawRunData) {
      return null;
    }
    
    // Create a default structure if some properties are missing
    return {
      ...rawRunData,
      // Ensure these are always arrays
      step_states: rawRunData.step_states || [],
      step_tasks: rawRunData.step_tasks || [],
    };
  }, [rawRunData]);

  // Debug output to see what's happening with the data
  useEffect(() => {
    console.log('FlowRunProvider state:', {
      runId,
      hasRunData: !!runData,
      loading,
      error,
      currentTimeUpdating: !!currentTime,
    });
    
    if (runData) {
      console.log('RunData details:', {
        status: runData.status,
        stepStateCount: runData.step_states?.length || 0,
        stepTaskCount: runData.step_tasks?.length || 0,
      });
    }
  }, [runId, runData, loading, error, currentTime]);

  const value = {
    runData,
    loading: loading && !runData, // Only show loading if we have no data
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