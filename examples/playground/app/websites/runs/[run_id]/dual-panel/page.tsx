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
    <div className="flex flex-col lg:flex-row">
      {/* Main panel: User-friendly UI */}
      <div className="lg:w-[65%] xl:w-[70%] lg:pr-6">
        <WebsiteAnalysisUI
          runData={runData}
          loading={loading}
          error={error}
          onAnalyzeWebsite={analyzeWebsite}
          analyzeLoading={analyzeLoading}
          analyzeError={analyzeError}
        />
      </div>

      {/* Side panel: Technical details - fixed position */}
      <div className="lg:w-[35%] xl:w-[30%] opacity-80">
        <div className="fixed top-16 bottom-4 right-4 lg:w-[calc(35%-2rem)] xl:w-[calc(30%-2rem)] overflow-hidden flex flex-col">
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
