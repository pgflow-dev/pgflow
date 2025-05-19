'use client';

import { FlowRunProvider, useFlowRun } from '@/components/flow-run-provider';
import FlowRunDetails from '@/components/flow-run-details';
import WebsiteAnalysisUI from '@/components/website-analysis-ui';
import { useState } from 'react';

// Component that uses the shared context
function RunPageContent({ runId }: { runId: string }) {
  const [isPinned, setIsPinned] = useState(() => {
    // Initialize from localStorage if available (client-side only)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('techDetailsPinned');
      return saved !== null ? saved === 'true' : true; // Default to true if not set
    }
    return true; // Default to true
  });
  
  const {
    runData,
    loading,
    error,
    analyzeWebsite,
    analyzeLoading,
    analyzeError,
  } = useFlowRun();

  return (
    <div className="flex flex-col lg:flex-row">
      {/* Debug panel: Technical details - first on mobile, right side on desktop */}
      <div className="w-full lg:w-[35%] xl:w-[30%] order-first lg:order-last mb-6 lg:mb-0">
        <div 
          className={`relative lg:fixed lg:top-16 lg:bottom-20 lg:right-4 w-full lg:w-[calc(35%-2rem)] xl:w-[calc(30%-2rem)] overflow-hidden flex flex-col transition-all duration-300 group rounded-lg hover:shadow-sm z-10
            ${isPinned 
              ? "opacity-100 border border-solid border-muted/30" 
              : "opacity-50 hover:opacity-100 cursor-pointer border border-dashed border-muted/20 hover:border-solid"
            }`}
        >
          {/* Pin button for keeping sidebar visible - moved to right side */}
          <div 
            className={`absolute top-3 right-6 z-20 flex items-center gap-1.5 select-none cursor-pointer
              ${isPinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"} 
              transition-opacity duration-200`}
            onClick={(e) => {
              e.stopPropagation();
              const newPinned = !isPinned;
              setIsPinned(newPinned);
              // Save to localStorage
              if (typeof window !== 'undefined') {
                localStorage.setItem('techDetailsPinned', newPinned.toString());
              }
            }}
          >
            <span className="text-xs text-foreground/70 hover:text-foreground">
              {isPinned ? "Panel always visible" : "Always show this panel"}
            </span>
            <div 
              className={`h-4 w-4 rounded border flex items-center justify-center
                ${isPinned 
                  ? "bg-primary border-primary" 
                  : "border-foreground/30 hover:border-primary/70"
                }`}
            >
              {isPinned && (
                <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3 text-primary-foreground">
                  <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </div>

          {/* Interactive hover hint overlay - only shown when not pinned */}
          {!isPinned && (
            <>
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
            </>
          )}

          <FlowRunDetails
            runId={runData?.run_id || ''}
            runData={runData}
            loading={loading}
            error={error}
          />
        </div>
      </div>

      {/* Main panel: User-friendly UI - second on mobile, left side on desktop */}
      <div className="w-full lg:w-[65%] xl:w-[70%] lg:pr-6 order-last lg:order-first">
        <WebsiteAnalysisUI
          runData={runData}
          loading={loading}
          error={error}
          onAnalyzeWebsite={analyzeWebsite}
          analyzeLoading={analyzeLoading}
          analyzeError={analyzeError}
        />
      </div>
    </div>
  );
}

/**
 * Wrapper component that provides the FlowRunProvider context
 * 
 * @param runId - The ID of the flow run to display
 * @param initialData - PERFORMANCE FIX: Server-side fetched data passed down to prevent duplicate DB calls
 *                      This fixes the performance issue identified in the security audit
 */
export default function RunPageClientContent({ 
  runId, 
  initialData 
}: { 
  runId: string;
  initialData?: any;
}) {
  return (
    <FlowRunProvider runId={runId} initialData={initialData}>
      <RunPageContent runId={runId} />
    </FlowRunProvider>
  );
}