import { Suspense } from 'react';
import { getOptimizedFlowRunData } from '@/lib/services/get-flow-run';
import RunPageClientContent from '@/components/run-page-content';

// Loading component
function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center">
        <div className="h-12 w-12 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-4"></div>
        <p className="text-foreground/60">Loading run data...</p>
      </div>
    </div>
  );
}

// Error component
function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-lg">
      <h2 className="text-xl font-medium text-destructive mb-2">Error</h2>
      <p className="text-destructive/80">{message}</p>
    </div>
  );
}

// Main server component
export default async function RunPage({ params }: { params: Promise<{ run_id: string }> }) {
  // Get the run ID from the URL params
  const { run_id: runId } = await params;
  
  // Initial server-side data fetch - using optimized query for faster initial load
  // The client component will fetch full data on completion
  const { data, error } = await getOptimizedFlowRunData(runId);
  
  // If there's an error, display it
  if (error) {
    return <ErrorDisplay message={error} />;
  }

  // Even if server fetch is successful, we still use the client component 
  // with real-time updates to get the latest data
  return (
    <Suspense fallback={<LoadingState />}>
      <RunPageClientContent runId={runId} />
    </Suspense>
  );
}