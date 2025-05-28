'use client';

import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
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
  const runData = useMemo(() => {
    if (!flowRun) return null;

    // Known step names for the analyze_website flow
    const knownStepSlugs = ['website', 'summary', 'tags', 'saveToDb'];
    
    // Create step_states array from FlowRun steps
    const step_states = knownStepSlugs.map(stepSlug => {
      const step = flowRun.step(stepSlug);
      return {
        run_id: flowRun.run_id,
        step_slug: stepSlug,
        status: step.status,
        started_at: step.started_at,
        completed_at: step.completed_at,
        failed_at: step.failed_at,
        step: {
          step_index: step.generation || 0 // Use generation as step_index
        }
      };
    });

    // Create step_tasks array from FlowRun steps
    const step_tasks = knownStepSlugs.map(stepSlug => {
      const step = flowRun.step(stepSlug);
      return {
        run_id: flowRun.run_id,
        step_slug: stepSlug,
        status: step.status,
        output: step.output,
        error_message: step.error_message,
        started_at: step.started_at,
        completed_at: step.completed_at,
        failed_at: step.failed_at,
        attempts_count: 1, // Default for compatibility
        step_index: step.generation || 0
      };
    }).filter(task => task.status !== 'created'); // Only include tasks that have been started

    return {
      run_id: flowRun.run_id,
      flow_slug: flowRun.flow_slug,
      status: flowRun.status,
      input: flowRun.input,
      output: flowRun.output,
      started_at: flowRun.started_at,
      completed_at: flowRun.completed_at,
      failed_at: flowRun.failed_at,
      remaining_steps: flowRun.remaining_steps,
      step_states,
      step_tasks,
    };
  }, [flowRun]);

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
        // First dispose any existing cached run to ensure fresh data
        pgflow.dispose(runId);
        
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
          
          // Keep the run loaded and responsive during step transitions
          // Don't change loading state for individual step events
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
  }, [runId]);

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