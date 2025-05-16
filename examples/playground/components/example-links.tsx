'use client';

import { useRouter } from 'next/navigation';
import { useTransition, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { exampleLinks } from '@/lib/example-links';
import { useLoadingState } from './loading-state-provider';

export default function ExampleLinks() {
  const [isPending, startTransition] = useTransition();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();
  const { setLoading } = useLoadingState();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsLoggedIn(!!data.user);
    });
  }, []);

  // Function to handle example link clicks
  const handleExampleClick = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    if (isPending) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    
    // If user is not logged in, redirect to sign-in page
    if (!isLoggedIn) {
      console.log('User not logged in, storing URL and redirecting to sign-in:', url);
      localStorage.setItem('pendingAnalysisUrl', url);
      router.push('/sign-in');
      return;
    }

    console.log('Starting analysis for example URL:', url);
    
    // Set global loading state to true
    setLoading(true);
    
    startTransition(async () => {
      try {
        const { data, error } = await supabase.rpc('start_analyze_website_flow', {
          url,
        });

        if (error) {
          console.error('Error starting analysis:', error);
          setLoading(false);
          return;
        }

        if (data && data.run_id) {
          console.log(
            'Analysis started, redirecting to:',
            `/websites/runs/${data.run_id}`,
          );
          router.push(`/websites/runs/${data.run_id}`);
        } else {
          console.error('No run_id returned from analysis');
          setLoading(false);
        }
      } catch (error) {
        console.error('Exception during analysis:', error);
        setLoading(false);
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-4">
      {exampleLinks.map((link) => (
        <a
          key={link.url}
          onClick={(e) => handleExampleClick(e, link.url)}
          href="#"
          className={`inline-flex px-3 py-2 ${
            link.variant === 'success'
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-red-100 text-red-800 hover:bg-red-200'
          } rounded-md text-sm font-medium ${
            isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
          aria-disabled={isPending}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}