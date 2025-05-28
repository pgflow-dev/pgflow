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
    const hookStartTime = performance.now();
    console.log('🔥 useStartAnalysis.start() called with:', url);
    
    startTransition(async () => {
      try {
        console.log('⏳ Calling startWebsiteAnalysis...');
        const startAnalysisTime = performance.now();
        const runId = await startWebsiteAnalysis(url);
        const endAnalysisTime = performance.now();
        console.log(`✅ startWebsiteAnalysis returned in ${(endAnalysisTime - startAnalysisTime).toFixed(2)}ms`);
        
        console.log('⏳ Navigating to run page...');
        const navStart = performance.now();
        router.push(`/websites/runs/${runId}`);
        const navEnd = performance.now();
        console.log(`✅ Navigation called in ${(navEnd - navStart).toFixed(2)}ms`);
        
        const totalHookTime = performance.now() - hookStartTime;
        console.log(`🎉 useStartAnalysis.start() completed in ${totalHookTime.toFixed(2)}ms total`);
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