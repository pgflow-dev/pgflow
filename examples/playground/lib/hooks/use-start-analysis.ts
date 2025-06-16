// lib/hooks/use-start-analysis.ts
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startWebsiteAnalysis } from '@/lib/services/start-analysis';
import { useFlowRunStore } from '@/components/flow-run-store-provider';

export function useStartAnalysis() {
  const router = useRouter();
  const { addRunId } = useFlowRunStore();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function start(url: string) {
    setError(null);
    setIsPending(true);
    
    try {
      const flowRun = await startWebsiteAnalysis(url);
      // Store only the run ID before navigating
      console.log('useStartAnalysis: Storing run ID in store', flowRun.run_id);
      addRunId(flowRun.run_id);
      
      // Small delay to ensure store update completes
      await new Promise(resolve => setTimeout(resolve, 50));
      
      router.push(`/websites/runs/${flowRun.run_id}`);
    } catch (err: any) {
      if (err?.code === 'AUTH_REQUIRED') {
        // we want to remember the url and redirect
        localStorage.setItem('pendingAnalysisUrl', url);
        router.push('/sign-in');
        return;
      }
      setError(err.message ?? 'Something went wrong');
    } finally {
      setIsPending(false);
    }
  }

  return { start, error, isPending };
}