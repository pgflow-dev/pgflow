'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStartAnalysis } from '@/lib/hooks/use-start-analysis';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TestNewPage() {
  const router = useRouter();
  const { start, isPending, error } = useStartAnalysis();
  const [url, setUrl] = useState('https://example.com');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    // This will now redirect to the new implementation automatically
    await start(url);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-md mx-auto">
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h1 className="text-xl font-bold text-blue-800 mb-2">🧪 Test New PgflowClient</h1>
          <p className="text-blue-700 text-sm">
            This page will start a flow using the new PgflowClient implementation and automatically 
            redirect to the new viewing interface.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="url">Website URL to Analyze</Label>
            <Input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              disabled={isPending}
            />
          </div>
          
          <Button 
            type="submit" 
            disabled={isPending || !url}
            className="w-full"
          >
            {isPending ? '🔄 Starting Flow...' : '🚀 Start Analysis (New Implementation)'}
          </Button>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
        </form>

        <div className="mt-8 p-4 bg-gray-50 border rounded-md">
          <h3 className="font-medium mb-2">What happens next:</h3>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Flow starts using <code>PgflowClient.startFlow()</code></li>
            <li>Redirects to <code>/websites/runs/[id]/page-new</code></li>
            <li>Shows dynamic step discovery (no hardcoded lists!)</li>
            <li>Real-time updates via PgflowClient events</li>
          </ol>
        </div>
      </div>
    </div>
  );
}