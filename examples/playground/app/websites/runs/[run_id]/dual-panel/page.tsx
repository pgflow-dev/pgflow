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
      {/* Main panel: User-friendly UI */}
      <div className="lg:col-span-7 xl:col-span-8">
        <WebsiteAnalysisUI
          runData={runData}
          loading={loading}
          error={error}
          onAnalyzeWebsite={analyzeWebsite}
          analyzeLoading={analyzeLoading}
          analyzeError={analyzeError}
        />
      </div>

      {/* Side panel: Technical details */}
      <div className="lg:col-span-5 xl:col-span-4 opacity-80">
        <h3 className="text-lg font-medium mb-2 text-muted-foreground">
          Technical Details about Flow Run
        </h3>
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
    <FlowRunProvider runId={runId}>
      <DualPanelContent />
    </FlowRunProvider>
  );
}
