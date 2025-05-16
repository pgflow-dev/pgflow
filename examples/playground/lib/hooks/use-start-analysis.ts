// lib/hooks/use-start-analysis.ts
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startWebsiteAnalysis } from '@/lib/services/start-analysis';

export function useStartAnalysis() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function start(url: string) {
    setError(null);
    startTransition(async () => {
      try {
        const runId = await startWebsiteAnalysis(url);
        router.push(`/websites/runs/${runId}`);
      } catch (err: any) {
        if (err?.code === 'AUTH_REQUIRED') {
          // we want to remember the url and redirect
          localStorage.setItem('pendingAnalysisUrl', url);
          router.push('/sign-in');
          return;
        }
        setError(err.message ?? 'Something went wrong');
      }
    });
  }

  return { start, error, isPending };
}