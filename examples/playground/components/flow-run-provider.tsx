'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePgflowClient } from '@/lib/pgflow-client-provider';
import { useLoadingState } from './loading-state-provider';
import type { FlowRun } from '@pgflow/client';

interface FlowRunContextType {
  flowRun: FlowRun | null;
  loading: boolean;
  error: string | null;
}

const FlowRunContext = createContext<FlowRunContextType>({
  flowRun: null,
  loading: true,
  error: null,
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

  const { setLoading: setGlobalLoading } = useLoadingState();
  const pgflow = usePgflowClient();

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
        
        // Just call getRun - the PgflowClient will return cached instance if exists
        const run = await pgflow.getRun(runId);
        
        if (!run) {
          if (isMounted) {
            setError('Flow run not found');
            setGlobalLoading(false);
            setLoading(false);
          }
          return;
        }

        if (!isMounted) return;

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
          unsubscribeStatus();
          // Don't dispose the run - let PgflowClient manage its cache
          // pgflow.dispose(runId);
        };
      } catch (err) {
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
      isMounted = false;
      cleanup?.();
    };
  }, [runId, setGlobalLoading, pgflow]);

  const value = {
    flowRun,
    loading,
    error,
  };

  return (
    <FlowRunContext.Provider value={value}>{children}</FlowRunContext.Provider>
  );
}