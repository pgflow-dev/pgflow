'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { createClient } from '@/utils/supabase/client';

export default function WebsiteAnalyzerForm({
  isLoggedIn,
}: {
  isLoggedIn: boolean;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleAnalyzeWebsite(formData: FormData) {
    const url = formData.get('url') as string;
    
    if (!url) {
      setFormError('Please enter a URL');
      return;
    }
    
    // If user is not logged in, redirect to sign-in page
    if (!isLoggedIn) {
      console.log('User not logged in, storing URL and redirecting to sign-in:', url);
      // Store the URL in localStorage to redirect back after login
      localStorage.setItem('pendingAnalysisUrl', url);
      router.push('/sign-in');
      return;
    }

    const url = formData.get('url') as string;

    if (!url) {
      setFormError('Please enter a URL');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('start_analyze_website_flow', {
        url,
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      if (data && data.run_id) {
        router.push(`/websites/runs/${data.run_id}`);
      } else {
        setFormError('Failed to start flow analysis');
      }
    } catch (error) {
      setFormError('An error occurred while starting the analysis');
      console.error(error);
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
            defaultValue="https://reddit.com/r/supabase"
            required
          />
        </div>
        <SubmitButton>
          {isLoggedIn ? 'Start Analysis' : 'Sign in & Analyze'}
        </SubmitButton>
        {formError && <FormMessage message={{ error: formError }} />}
      </form>
    </div>
  );
}
