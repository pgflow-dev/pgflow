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
              const { data, error } = await supabase.rpc('start_analyze_website_flow', {
                url: pendingUrl,
              });

              if (error) {
                console.error('Error starting analysis:', error);
                return;
              }

              if (data && data.run_id) {
                console.log('Analysis started, redirecting to:', `/websites/runs/${data.run_id}`);
                router.push(`/websites/runs/${data.run_id}`);
              } else {
                console.error('No run_id returned from analysis');
              }
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
  }, [router, supabase, isChecking]);

  return null; // This component doesn't render anything
}
