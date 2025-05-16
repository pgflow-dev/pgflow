'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { createClient } from '@/utils/supabase/client';
import { useLoadingState } from './loading-state-provider';

export default function WebsiteAnalyzerForm() {
  const [formError, setFormError] = useState<string | null>(null);
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

  async function handleAnalyzeWebsite(formData: FormData) {
    const url = formData.get('url') as string;

    if (!url) {
      setFormError('Please enter a URL');
      return;
    }

    // If user is not logged in, redirect to sign-in page
    if (!isLoggedIn) {
      console.log(
        'User not logged in, storing URL and redirecting to sign-in:',
        url,
      );
      // Store the URL in localStorage to redirect back after login
      localStorage.setItem('pendingAnalysisUrl', url);
      router.push('/sign-in');
      return;
    }

    if (!url) {
      setFormError('Please enter a URL');
      return;
    }

    try {
      console.log('Starting analysis for URL:', url);
      // Set global loading state to true
      setLoading(true);
      
      // Start the transition to show loading state
      startTransition(async () => {
        const { data, error } = await supabase.rpc('start_analyze_website_flow', {
          url,
        });

        if (error) {
          console.error('Error starting analysis:', error);
          setFormError(error.message);
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
          setFormError('Failed to start flow analysis');
          setLoading(false);
        }
      });
    } catch (error) {
      setFormError('An error occurred while starting the analysis');
      console.error('Exception during analysis:', error);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col w-full p-4 gap-4 border rounded-lg shadow-sm">
      <h2 className="text-2xl font-medium">Analyze a Website</h2>
      <p className="text-sm text-foreground/60">
        Enter a URL to analyze a website
        {!isLoggedIn && " (you'll need to sign in first)"}
      </p>
      <form action={handleAnalyzeWebsite} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="url">Website URL</Label>
          <Input
            type="url"
            name="url"
            id="url"
            placeholder="https://example.com"
            defaultValue="https://example.com"
            required
            disabled={isPending}
          />
        </div>
        <SubmitButton disabled={isPending} pendingText="🔄 Starting analysis...">
          {isLoggedIn ? '🚀 Start Analysis' : 'Sign in & Analyze'}
        </SubmitButton>
        {formError && <FormMessage message={{ error: formError }} />}
      </form>
      {isLoggedIn === false && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-yellow-800">
            You'll need to sign in to analyze websites. When you click the
            button, you'll be redirected to the sign-in page.
          </p>
        </div>
      )}
    </div>
  );
}
