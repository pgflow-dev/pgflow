// lib/hooks/use-start-analysis.ts
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startWebsiteAnalysis } from '@/lib/services/start-analysis';
import { usePgflowClient } from '@/lib/pgflow-client-provider';

export function useStartAnalysis() {
  const router = useRouter();
  const pgflow = usePgflowClient();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function start(url: string) {
    setError(null);
    setIsPending(true);
    
    try {
      const flowRun = await startWebsiteAnalysis(url, {}, pgflow);
      // Navigate immediately - PgflowClient already has the run cached
      console.log('useStartAnalysis: Navigating to run', flowRun.run_id);
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