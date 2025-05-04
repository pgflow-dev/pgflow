'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { useStartFlowRun } from '@/lib/use-flow-run';

export default function WebsiteAnalyzerForm({
  isLoggedIn,
}: {
  isLoggedIn: boolean;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const { analyzeWebsite, analyzeLoading, analyzeError } = useStartFlowRun();

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

    try {
      await analyzeWebsite(url);
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError('An error occurred while starting the analysis');
      }
      console.error('Exception during analysis:', error);
    }
  }

  // Use analyzeError from the hook if available
  const displayError = formError || analyzeError;

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
          />
        </div>
        <SubmitButton disabled={analyzeLoading}>
          {isLoggedIn ? 
            (analyzeLoading ? 'Starting Analysis...' : '🚀 Start Analysis') : 
            'Sign in & Analyze'
          }
        </SubmitButton>
        {displayError && <FormMessage message={{ error: displayError }} />}
      </form>
    </div>
  );
}
