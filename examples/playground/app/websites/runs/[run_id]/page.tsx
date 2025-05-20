import { Suspense } from 'react';
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

// Note: This error component is kept for future use
// but commented out for now since it's currently unused
/*
function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-lg">
      <h2 className="text-xl font-medium text-destructive mb-2">Error</h2>
      <p className="text-destructive/80">{message}</p>
    </div>
  );
}
*/

// Main server component
export default async function RunPage({ params }: { params: Promise<{ run_id: string }> }) {
  // Get the run ID from the URL params
  const { run_id: runId } = await params;
  
  // No initial server-side data fetch here
  // The client component will fetch the data via useFlowRun
  
  // Return the client component to handle data fetching and real-time updates
  return (
    <Suspense fallback={<LoadingState />}>
      <RunPageClientContent runId={runId} />
    </Suspense>
  );
}