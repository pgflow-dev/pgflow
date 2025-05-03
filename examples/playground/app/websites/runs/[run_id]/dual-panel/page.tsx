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
      <div className="lg:w-[35%] xl:w-[30%]">
        <div className="fixed top-16 bottom-4 right-4 lg:w-[calc(35%-2rem)] xl:w-[calc(30%-2rem)] overflow-hidden flex flex-col opacity-50 hover:opacity-100 transition-all duration-300 group cursor-pointer hover:shadow-lg border border-dashed border-foreground/20 hover:border-solid">
          {/* Interactive hover hint overlay */}
          <div className="absolute inset-0 bg-background/60 group-hover:bg-transparent transition-all duration-300 pointer-events-none"></div>

          {/* Large centered hint */}
          <div className="absolute inset-0 flex flex-col items-center justify-center group-hover:opacity-0 transition-opacity duration-300 pointer-events-none">
            <div className="bg-foreground/5 backdrop-blur-sm rounded-lg p-4 border border-foreground/10 transform group-hover:scale-90 transition-transform">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-2 text-primary"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <p className="text-sm font-medium text-foreground/70">
                Hover to reveal
              </p>
            </div>

            {/* Pulsing animation to draw attention */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border border-primary/20 animate-ping opacity-70"></div>
          </div>

          <FlowRunDetails
            runId={runData?.run_id || ''}
            runData={runData}
            loading={loading}
            error={error}
            currentTime={currentTime}
          />

          {/* Floating hint badge at bottom right */}
          <div className="absolute bottom-3 right-3 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs flex items-center gap-1 group-hover:opacity-0 transition-all duration-300 shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 15l-5-5"></path>
              <path d="M22 8a10 10 0 0 0 -9.7 12"></path>
              <path d="M15 9 A6 6 0 0 1 15 15 A6 6 0 0 1 9 15 A6 6 0 0 1 15 9 z"></path>
              <path d="M2 16a10 10 0 0 0 12 -9.7"></path>
            </svg>
            Hover to reveal
          </div>
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
