'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function FlowRunPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.run_id as string;

  // Redirect to the dual-panel view
  useEffect(() => {
    router.replace(`/websites/runs/${runId}/dual-panel`);
  }, [runId, router]);

  // Show a loading state while redirecting
  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-4"></div>
          <p className="text-foreground/60">Redirecting to enhanced view...</p>
        </div>
      </div>
    </div>
  );
}
