'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import { createClient } from '@/utils/supabase/client';
import { useLoadingState } from './loading-state-provider';
import { PgflowClient, FlowRun } from '@pgflow/client';

interface FlowRunContextType {
  // New PgflowClient-based properties
  flowRun: FlowRun | null;
  pgflowClient: PgflowClient | null;
  
  // Legacy properties (for backward compatibility during migration)
  runData: any | null;
  loading: boolean;
  error: string | null;
  currentTime: Date;
  analyzeWebsite: (url: string) => Promise<void>;
  analyzeLoading: boolean;
  analyzeError: string | null;
}

const FlowRunContext = createContext<FlowRunContextType>({
  flowRun: null,
  pgflowClient: null,
  runData: null,
  loading: true,
  error: null,
  currentTime: new Date(),
  analyzeWebsite: async () => {},
  analyzeLoading: false,
  analyzeError: null,
});

export const useFlowRun = () => useContext(FlowRunContext);

interface FlowRunProviderProps {
  runId: string;
  children: ReactNode;
}

export function FlowRunProvider({ runId, children }: FlowRunProviderProps) {
  // New PgflowClient state
  const [flowRun, setFlowRun] = useState<FlowRun | null>(null);
  const [pgflowClient, setPgflowClient] = useState<PgflowClient | null>(null);
  
  // Legacy state (for backward compatibility)
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const router = useRouter();
  const supabase = createClient();
  const { setLoading: setGlobalLoading } = useLoadingState();
  
  // Use the shared hook for starting analysis
  const { start: analyzeWebsite, isPending: analyzeLoading, error: analyzeError } = useStartAnalysis();

  // Derive legacy runData from FlowRun for backward compatibility
  const runData = flowRun ? {
    run_id: flowRun.run_id,
    flow_slug: flowRun.flow_slug,
    status: flowRun.status,
    input: flowRun.input,
    output: flowRun.output,
    started_at: flowRun.started_at,
    completed_at: flowRun.completed_at,
    failed_at: flowRun.failed_at,
    remaining_steps: flowRun.remaining_steps,
    step_states: [], // Will be populated as components migrate
    step_tasks: [], // Will be populated as components migrate
  } : null;

  useEffect(() => {
    if (!runId) return;
    
    setLoading(true);
    setGlobalLoading(true);

    // Initialize PgflowClient
    const pgflow = new PgflowClient(supabase);
    setPgflowClient(pgflow);

    let disposed = false;

    // Get the FlowRun instance
    const loadFlowRun = async () => {
      try {
        const run = await pgflow.getRun(runId);
        
        if (disposed) return;
        
        if (!run) {
          setError('Run not found');
          setGlobalLoading(false);
          setLoading(false);
          return;
        }

        setFlowRun(run);
        
        // Set up real-time event listeners
        run.on('*', (event) => {
          console.log('FlowRun event:', event);
          
          // Update global loading state based on run status
          if (['completed', 'failed', 'error', 'cancelled'].includes(event.status)) {
            setGlobalLoading(false);
          }
        });

        // If run is already terminal, turn off loading
        if (['completed', 'failed', 'error', 'cancelled'].includes(run.status)) {
          setGlobalLoading(false);
        }

        setError(null);
      } catch (err: any) {
        if (disposed) return;
        
        console.error('Error loading FlowRun:', err);
        setError(err.message || 'Failed to load flow run');
        setGlobalLoading(false);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    loadFlowRun();

    // Set up timer for currentTime (for legacy compatibility)
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(timer);
      pgflow.dispose(runId);
    };
  }, [runId, supabase, setGlobalLoading]);

  const value: FlowRunContextType = {
    // New PgflowClient-based properties
    flowRun,
    pgflowClient,
    
    // Legacy properties (for backward compatibility)
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