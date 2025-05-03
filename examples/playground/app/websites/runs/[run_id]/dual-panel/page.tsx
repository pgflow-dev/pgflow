'use client';

import { useParams } from 'next/navigation';
import { FlowRunProvider, useFlowRun } from '@/components/flow-run-provider';
import FlowRunDetails from '@/components/flow-run-details';
import WebsiteAnalysisUI from '@/components/website-analysis-ui';

// Component that uses the shared context
function DualPanelContent() {
  const {
    runData,
    loading,
    error,
    currentTime,
    analyzeWebsite,
    analyzeLoading,
    analyzeError,
  } = useFlowRun();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left panel: User-friendly UI */}
      <div className="lg:col-span-6 xl:col-span-6">
        <WebsiteAnalysisUI
          runData={runData}
          loading={loading}
          error={error}
          onAnalyzeWebsite={analyzeWebsite}
          analyzeLoading={analyzeLoading}
          analyzeError={analyzeError}
        />
      </div>

      {/* Right panel: Technical debug UI */}
      <div className="lg:col-span-6 xl:col-span-6">
        <FlowRunDetails
          runId={runData?.run_id || ''}
          runData={runData}
          loading={loading}
          error={error}
          currentTime={currentTime}
        />
      </div>
    </div>
  );
}

export default function DualPanelPage() {
  const params = useParams();
  const runId = params.run_id as string;

  return (
    <div className="container mx-auto pt-0">
      <h1 className="text-2xl font-bold mb-2">Website Analysis Demo</h1>

      <FlowRunProvider runId={runId}>
        <DualPanelContent />
      </FlowRunProvider>
    </div>
  );
}
