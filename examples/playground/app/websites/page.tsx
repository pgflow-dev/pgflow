'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import type { Database } from '@/supabase/functions/database-types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { SkeletonTable } from '@/components/skeleton-table';

type WebsiteRow = Database['public']['Tables']['websites']['Row'];

export default function Page() {
  const [websites, setWebsites] = useState<WebsiteRow[] | null>(null);
  const [url, setUrl] = useState('https://reddit.com/r/supabase');
  const { start: startAnalysis, isPending, error: formError } = useStartAnalysis();
  const supabase = createClient();

  // Process URL parameter when the component mounts
  useEffect(() => {
    const getData = async () => {
      const { data } = await supabase.from('websites').select();
      setWebsites(data);
    };
    getData();
    
    // Check for URL parameter and start analysis if present
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlParam = urlParams.get('url');
      
      if (urlParam) {
        setUrl(urlParam);
        console.log("Found URL parameter, starting analysis:", urlParam);
        
        // Use a tiny delay to ensure we're already in the client-side
        // This helps prevent the page from fully rendering before redirecting
        setTimeout(() => {
          startAnalysis(urlParam);
        }, 10);
      }
    }
  }, [startAnalysis]);
  
  async function startAnalyzeWebsiteFlow(formData: FormData) {
    const url = formData.get('url') as string;
    if (url) {
      startAnalysis(url);
    }
  }

  return (
    <div className="container mx-auto py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <form className="flex flex-col w-full p-4 gap-4 border rounded-lg shadow-sm">
            <h2 className="text-2xl font-medium">Analyze a Website</h2>
            <p className="text-sm text-foreground/60">
              Enter a URL to analyze a website
            </p>
            <div>
              <Label htmlFor="url">Website URL</Label>
              <Input
                type="url"
                name="url"
                id="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <SubmitButton 
              formAction={startAnalyzeWebsiteFlow} 
              disabled={isPending}
              pendingText="🔄 Starting analysis..."
            >
              Start Analysis
            </SubmitButton>
            {formError && <FormMessage message={{ error: formError }} />}
          </form>
        </div>

        <div>
          <h2 className="text-2xl font-medium mb-4">Your Websites</h2>
          {websites === null ? (
            <SkeletonTable />
          ) : websites.length > 0 ? (
            <div className="border rounded-lg shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-3 text-left">ID</th>
                      <th className="p-3 text-left">URL</th>
                      <th className="p-3 text-left">Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websites.map((website) => (
                      <tr key={website.id} className="border-t">
                        <td className="p-3">{website.id}</td>
                        <td className="p-3">{website.website_url}</td>
                        <td className="p-3">
                          {new Date(website.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No websites analyzed yet</p>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              View Raw Data
            </summary>
            <pre className="mt-2 p-2 bg-muted rounded-md text-xs overflow-auto">
              {JSON.stringify(websites, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
