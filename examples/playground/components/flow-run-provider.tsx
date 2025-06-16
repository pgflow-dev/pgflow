'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import { getPgflowClient } from '@/lib/pgflow-client';
import { useLoadingState } from './loading-state-provider';
import { useFlowRunStore } from './flow-run-store-provider';
import type { FlowRun } from '@pgflow/client';

interface FlowRunContextType {
  flowRun: FlowRun | null;
  loading: boolean;
  error: string | null;
  analyzeWebsite: (url: string) => Promise<void>;
  analyzeLoading: boolean;
  analyzeError: string | null;
}

const FlowRunContext = createContext<FlowRunContextType>({
  flowRun: null,
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
  const [flowRun, setFlowRun] = useState<FlowRun | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { setLoading: setGlobalLoading } = useLoadingState();
  const { hasRunId, removeRunId } = useFlowRunStore();
  
  // Use the shared hook for starting analysis
  const { start: analyzeWebsite, isPending: analyzeLoading, error: analyzeError } = useStartAnalysis();

  useEffect(() => {
    if (!runId) return;
    
    setLoading(true);
    // Set global loading state to true when initially loading run data
    setGlobalLoading(true);
    
    // Track if this effect is still mounted
    let isMounted = true;

    // Load the flow run
    const loadFlowRun = async () => {
      try {
        const pgflow = getPgflowClient();
        
        // Check if we know about this run from navigation
        const isKnownRun = hasRunId(runId);
        console.log('FlowRunProvider: Loading run', runId, 'Known from navigation:', isKnownRun);
        
        // If this is a newly created run, wait a bit for the database to be ready
        if (isKnownRun) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Always call getRun - the PgflowClient will handle caching and subscription management
        const run = await pgflow.getRun(runId);
        
        if (!run) {
          console.error('FlowRunProvider: No run found for', runId);
          if (isMounted) {
            setError('Flow run not found');
            setGlobalLoading(false);
            setLoading(false);
          }
          return;
        }

        if (!isMounted) return;

        console.log('FlowRunProvider: Setting flowRun', run);
        setFlowRun(run);

        // Subscribe to all run events to update global loading
        const unsubscribeStatus = run.on('*', (event) => {
          if (event.status === 'completed' || event.status === 'failed' || 
              event.status === 'error' || event.status === 'cancelled') {
            setGlobalLoading(false);
          }
        });

        // Check initial status
        const currentStatus = run.status;
        if (currentStatus === 'completed' || currentStatus === 'failed' || 
            currentStatus === 'error' || currentStatus === 'cancelled') {
          setGlobalLoading(false);
        }

        if (isMounted) {
          setLoading(false);
        }

        // Return cleanup function
        return () => {
          console.log('FlowRunProvider: Cleanup called for run', runId);
          unsubscribeStatus();
          pgflow.dispose(runId);
          // Only remove from store if this wasn't a navigation from start
          if (!hasRunId(runId)) {
            removeRunId(runId);
          }
        };
      } catch (err) {
        console.error('Error loading flow run:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load flow run');
          setGlobalLoading(false);
          setLoading(false);
        }
      }
    };

    let cleanup: (() => void) | undefined;
    loadFlowRun().then(cleanupFn => {
      if (isMounted) {
        cleanup = cleanupFn;
      }
    });

    return () => {
      console.log('FlowRunProvider: Effect cleanup for run', runId);
      isMounted = false;
      cleanup?.();
    };
  }, [runId, router, setGlobalLoading, hasRunId, removeRunId]);

  const value = {
    flowRun,
    loading,
    error,
    analyzeWebsite,
    analyzeLoading,
    analyzeError,
  };

  return (
    <FlowRunContext.Provider value={value}>{children}</FlowRunContext.Provider>
  );
}