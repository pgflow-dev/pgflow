'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchFlowRunData, ResultRow } from './db';
import { subscribeToFlowRun } from './flow-run-websocket';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { queryClient } from './query-client';

// Hook to use a flow run with realtime updates
export function useFlowRun(runId: string) {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // Update the current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Set up subscription separately from the query
  useEffect(() => {
    if (!runId) return;
    
    // Set up the subscription
    console.log('Setting up subscription for run:', runId);
    const unsubscribe = subscribeToFlowRun(runId);
    unsubscribeRef.current = unsubscribe;
    
    // Clean up subscription when component unmounts
    return () => {
      console.log('Cleaning up subscription for run:', runId);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [runId]);
  
  // Trigger immediate refetch when subscription is updated
  useEffect(() => {
    if (!runId) return;
    queryClient.invalidateQueries({ queryKey: ['flowRun', runId] });
  }, [runId]);

  // Fetch flow run data but don't set up subscription here
  const { 
    data: runData,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['flowRun', runId],
    queryFn: async () => {
      console.log('Fetching flow run data for:', runId);
      const { data, error } = await fetchFlowRunData(runId);
      
      if (error) {
        console.error('Error fetching run data:', error);
        throw new Error(error);
      }
      
      // Check if data is valid and has expected properties
      if (!data) {
        console.error('No data returned from fetchFlowRunData');
        // Return a skeleton object to prevent loading issues
        return {
          run_id: runId,
          status: 'started',
          flow_slug: 'analyze_website',
          step_states: [],
          step_tasks: []
        } as any;
      }
      
      // Ensure step_tasks and step_states are always arrays
      data.step_tasks = data.step_tasks || [];
      data.step_states = data.step_states || [];
      
      console.log('Successfully fetched run data:', {
        runId: data.run_id,
        status: data.status,
        stepStatesCount: data.step_states.length,
        stepTasksCount: data.step_tasks.length
      });
      
      return data;
    },
    enabled: !!runId,
    refetchInterval: 5000, // Fallback refetch every 5 seconds as a safety net
    staleTime: 0, // Consider data always stale to ensure refreshes
    cacheTime: 1000 * 60 * 5, // Cache for 5 minutes
    
    // Most importantly - show cached data while fetching to avoid loading state flickering
    keepPreviousData: true
  });

  // Error handling
  const error = queryError ? (queryError as Error).message : null;

  return {
    runData,
    loading,
    error,
    currentTime,
  };
}

// Hook to start a new flow run
export function useStartFlowRun() {
  const router = useRouter();
  const supabase = createClient();

  // Create a mutation for starting a flow run
  const { 
    mutate: startFlow, 
    isPending: analyzeLoading,
    error: mutationError,
  } = useMutation({
    mutationFn: async (url: string) => {
      console.log('Starting analysis for URL:', url);
      
      // Start the flow
      const { data, error } = await supabase.rpc('start_analyze_website_flow', {
        url,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data || !data.run_id) {
        throw new Error('No run_id returned from analysis');
      }
      
      // Create a skeleton object in the cache immediately
      // This is important to ensure the UI has something to show while waiting for real data
      const skeletonData: ResultRow = {
        run_id: data.run_id,
        status: 'started',
        started_at: new Date().toISOString(),
        flow_slug: 'analyze_website',
        input: { url },
        step_states: [],
        step_tasks: [],
      } as any;
      
      console.log('Creating initial skeleton data in cache:', data.run_id);
      queryClient.setQueryData(['flowRun', data.run_id], skeletonData);
      
      // Set up the WebSocket subscription immediately - BEFORE fetching data
      console.log('Setting up immediate subscription for new run:', data.run_id);
      subscribeToFlowRun(data.run_id);
      
      // Now fetch the initial data
      try {
        console.log('Now fetching complete initial run data for:', data.run_id);
        const initialRunData = await fetchFlowRunData(data.run_id);
        if (initialRunData.data && !initialRunData.error) {
          console.log('Successfully fetched initial data, updating cache');
          // Store the initial data in the cache
          queryClient.setQueryData(['flowRun', data.run_id], initialRunData.data);
        } else {
          console.warn('Failed to fetch initial data:', initialRunData.error);
        }
      } catch (e) {
        console.error('Exception while pre-fetching run data:', e);
        // We already have skeleton data in the cache, so we can still proceed
      }
      
      return data;
    },
    onSuccess: (data) => {
      // Navigate to the run page
      console.log('Analysis started, redirecting to:', `/websites/runs/${data.run_id}`);
      router.push(`/websites/runs/${data.run_id}`);
    },
  });

  // Error handling
  const analyzeError = mutationError ? (mutationError as Error).message : null;

  // Function to analyze a website with validation
  const analyzeWebsite = async (url: string) => {
    if (!url) {
      return Promise.reject(new Error('Please enter a URL'));
    }
    
    // Start the flow (the subscription is set up in the mutation function)
    startFlow(url);
  };

  return {
    analyzeWebsite,
    analyzeLoading,
    analyzeError,
  };
}