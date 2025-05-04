'use client';

import { useParams } from 'next/navigation';
import { FlowRunProvider, useFlowRun } from '@/components/flow-run-provider';
import FlowRunDetails from '@/components/flow-run-details';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { exampleLinks } from '@/lib/example-links';

// Component that uses the shared context
function RunPageContent() {
  const [showTechDetails, setShowTechDetails] = useState(() => {
    // Initialize from localStorage if available (client-side only)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('techDetailsPinned');
      return saved !== null ? saved === 'true' : false; // Default to false if not set
    }
    return false; // Default to false
  });
  
  const [url, setUrl] = useState<string>('');
  
  const {
    runData,
    loading,
    error,
    currentTime,
    analyzeWebsite,
    analyzeLoading,
    analyzeError,
  } = useFlowRun();

  // Check if we should show the URL input form
  const isCompleted = runData?.status === 'completed';
  const isFailed = runData?.status === 'failed';
  const showAnalyzeAnother = isCompleted || isFailed;

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      await analyzeWebsite(url.trim());
      setUrl('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top section with URL input if analysis is completed */}
      {showAnalyzeAnother && (
        <div className="mb-6 p-4 border rounded-lg">
          <h3 className="text-base font-medium mb-2">
            Analyze Website
            <span className="ml-2 text-xs text-muted-foreground">
              Triggers a multi-step workflow using <strong>pgflow</strong>
            </span>
          </h3>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-2"
          >
            <Input
              id="url-new"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="flex-1"
              disabled={analyzeLoading}
            />
            <Button type="submit" disabled={analyzeLoading} size="sm">
              {analyzeLoading ? 'Starting...' : 'Analyze'}
            </Button>
          </form>
          {analyzeError && (
            <div className="text-sm text-destructive mt-2">{analyzeError}</div>
          )}

          {/* Example site links */}
          <div className="mt-2 flex items-center text-xs">
            <span className="text-muted-foreground mr-2">Examples:</span>
            <div className="flex flex-wrap gap-2">
              {exampleLinks.map((link) => (
                <button
                  key={link.url}
                  onClick={() => analyzeWebsite(link.url)}
                  className={`${
                    link.variant === 'success'
                      ? 'text-green-600 hover:bg-green-50 hover:text-green-700'
                      : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                  } px-2 py-1 rounded`}
                  disabled={analyzeLoading}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main content - integrated view */}
      <FlowRunDetails
        runId={runData?.run_id || ''}
        runData={runData}
        loading={loading}
        error={error}
        currentTime={currentTime}
        showTechnicalDetails={showTechDetails}
      />
    </div>
  );
}

export default function RunPage() {
  const params = useParams();
  const runId = params.run_id as string;

  return (
    <FlowRunProvider runId={runId}>
      <RunPageContent />
    </FlowRunProvider>
  );
}