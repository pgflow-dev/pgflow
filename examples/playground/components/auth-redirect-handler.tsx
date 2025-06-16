'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function AuthRedirectHandler() {
  const router = useRouter();
  const supabase = createClient();
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // Only run this once
    if (isChecking) return;
    
    const checkPendingAnalysis = async () => {
      setIsChecking(true);
      
      try {
        // Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser();
        
        // If user is logged in and there's a pending analysis URL
        if (user && typeof window !== 'undefined') {
          const pendingUrl = localStorage.getItem('pendingAnalysisUrl');
          
          if (pendingUrl) {
            console.log('Found pending analysis URL:', pendingUrl);
            
            // Clear the pending URL
            localStorage.removeItem('pendingAnalysisUrl');
            
            try {
              // Start the analysis with the stored URL
              console.log('Starting analysis for URL:', pendingUrl);
              
              // Import startWebsiteAnalysis to reuse the same logic
              const { startWebsiteAnalysis } = await import('@/lib/services/start-analysis');
              
              const flowRun = await startWebsiteAnalysis(pendingUrl);
              console.log('Analysis started, redirecting to:', `/websites/runs/${flowRun.run_id}`);
              router.push(`/websites/runs/${flowRun.run_id}`);
            } catch (error) {
              console.error('Failed to start analysis:', error);
            }
          }
        }
      } finally {
        setIsChecking(false);
      }
    };

    checkPendingAnalysis();
  }, [router, supabase]);

  return null; // This component doesn't render anything
}
