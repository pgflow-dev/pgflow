'use client';

import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { useLoadingState } from './loading-state-provider';

export default function WebsiteAnalyzerForm() {
  const { start: startAnalysis, isPending, error: formError } = useStartAnalysis();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const supabase = createClient();
  const { setLoading } = useLoadingState();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: any } }) => {
      setIsLoggedIn(!!data.user);
    });
  }, []);

  async function handleAnalyzeWebsite(formData: FormData) {
    const url = formData.get('url') as string;
    
    if (!url) {
      return;
    }
    
    // Set global loading state to true
    setLoading(true);
    
    // Start analysis will handle auth check and redirect
    startAnalysis(url);
  }

  return (
    <div className="flex flex-col w-full p-4 gap-4 border rounded-lg shadow-sm">
      <h2 className="text-2xl font-medium">Analyze a Website</h2>
      <p className="text-sm text-foreground/60">
        Enter a URL to analyze a website
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
          🚀 Start Analysis
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
