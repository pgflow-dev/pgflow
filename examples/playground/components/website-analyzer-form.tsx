'use client';

import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { useLoadingState } from './loading-state-provider';

export default function WebsiteAnalyzerForm() {
  const { start: startAnalysis, isPending, error: formError } = useStartAnalysis();
  const { setLoading } = useLoadingState();

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
    </div>
  );
}
