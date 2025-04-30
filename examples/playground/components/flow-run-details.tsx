'use client';

import { useEffect } from 'react';
import { ResultRow } from '@/lib/db';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import JSONHighlighter from '@/components/json-highlighter';
import { FormMessage } from '@/components/form-message';

// Add CSS for breathing animation
const breathingAnimation = `
@keyframes breathe {
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
}
.breathing {
  animation: breathe 2s infinite ease-in-out;
}
`;

// Format time difference in a human-readable way
function formatTimeDifference(
  startDate: string | null,
  endDate: string | null,
): string {
  if (!startDate) return '';

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();

  const diffMs = end.getTime() - start.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 1) {
    return 'less than a second';
  }

  if (diffSec < 60) {
    return `${diffSec} second${diffSec !== 1 ? 's' : ''}`;
  }

  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;

  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
}

// Format relative time (e.g., "3 seconds ago")
function formatRelativeTime(
  date: string | null,
  now: Date = new Date(),
): string {
  if (!date) return '';

  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  // Handle case where time difference is negative (server/client time mismatch)
  if (diffSec < 1) {
    return 'just now';
  }

  if (diffSec < 60) {
    return `${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
  }

  const minutes = Math.floor(diffSec / 60);

  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

interface FlowRunDetailsProps {
  runId: string;
  runData: ResultRow | null;
  loading: boolean;
  error: string | null;
  currentTime: Date;
}

export default function FlowRunDetails({
  runId,
  runData,
  loading,
  error,
  currentTime,
}: FlowRunDetailsProps) {
  // Add the breathing animation to the head
  useEffect(() => {
    // Add the style element to the head
    const styleElement = document.createElement('style');
    styleElement.innerHTML = breathingAnimation;
    document.head.appendChild(styleElement);

    // Clean up when component unmounts
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-4"></div>
          <p className="text-foreground/60">Loading run data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-lg">
        <h2 className="text-xl font-medium text-destructive mb-2">Error</h2>
        <p className="text-destructive/80">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 border rounded-lg shadow-sm">
      {runData ? (
        <div className="space-y-6">
          <h2 className="text-2xl font-medium mb-6">Under the hood</h2>
          <hr />
          <div>
            <h3 className="text-lg font-medium mb-2">Status</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span
                  className={`inline-block w-3 h-3 rounded-full mr-2 ${
                    runData.status === 'completed'
                      ? 'bg-green-500'
                      : runData.status === 'started'
                        ? 'bg-yellow-500 breathing'
                        : runData.status === 'failed'
                          ? 'bg-red-500'
                          : runData.status === 'created'
                            ? 'bg-blue-500'
                            : 'bg-gray-500'
                  }`}
                ></span>
                <span className="capitalize">
                  {runData.status === 'started' ? 'running' : runData.status}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {runData.status === 'started' && runData.started_at && (
                  <span>
                    Running for {formatTimeDifference(runData.started_at, null)}
                  </span>
                )}
                {runData.status === 'completed' && runData.completed_at && (
                  <span>
                    Completed{' '}
                    {formatRelativeTime(runData.completed_at, currentTime)}
                  </span>
                )}
                {runData.status === 'failed' && runData.failed_at && (
                  <span>
                    Failed {formatRelativeTime(runData.failed_at, currentTime)}
                  </span>
                )}
                {runData.status === 'created' && runData.created_at && (
                  <span>
                    Created{' '}
                    {formatRelativeTime(runData.created_at, currentTime)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h4 className="font-medium mb-2">Run ID:</h4>
            <pre className="capitalize">{runId}</pre>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">
              Run Input
              <span className="ml-2 text-sm text-muted-foreground">
                JSON used to start the flow
              </span>
            </h3>
            <div className="max-h-40 overflow-hidden border border-gray-500/30 rounded-md">
              <div className="overflow-auto max-h-40">
                <JSONHighlighter data={runData.input} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">
              Steps Status
              <span className="ml-2 text-sm text-muted-foreground">
                Click steps to view details
              </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
              {runData.step_states &&
                (() => {
                  // Create a mapping of step_slug to step_index
                  const stepIndexMap = new Map<string, number>();
                  runData.step_states.forEach((state) => {
                    if (state.step && state.step_slug) {
                      stepIndexMap.set(
                        state.step_slug,
                        state.step?.step_index || 0,
                      );
                    }
                  });

                  // Sort step_states using the mapping
                  const sortedStepStates = [...runData.step_states].sort(
                    (a, b) => {
                      const aIndex = stepIndexMap.get(a.step_slug) || 0;
                      const bIndex = stepIndexMap.get(b.step_slug) || 0;
                      return aIndex - bIndex;
                    },
                  );

                  return sortedStepStates.map((step, index) => {
                    // Find the corresponding step task with output
                    const stepTask = runData.step_tasks?.find(
                      (task) =>
                        task.step_slug === step.step_slug &&
                        task.status === 'completed',
                    );

                    return (
                      <Collapsible
                        key={index}
                        className={`mb-2 rounded-lg border ${
                          step.status === 'completed'
                            ? 'bg-green-500/5 border-green-500/30'
                            : step.status === 'started'
                              ? 'bg-yellow-500/5 border-yellow-500/30'
                              : step.status === 'failed'
                                ? 'bg-red-500/5 border-red-500/30'
                                : step.status === 'created'
                                  ? 'bg-blue-500/5 border-blue-500/30'
                                  : 'bg-gray-500/5 border-gray-500/30'
                        }`}
                      >
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-left">
                          <div>
                            <h4 className="text-base font-medium">
                              {step.step_slug}
                            </h4>
                          </div>
                          <div className="flex items-center">
                            {step.status === 'started' && step.started_at && (
                              <span className="text-xs text-muted-foreground mr-3">
                                {formatRelativeTime(
                                  step.started_at,
                                  currentTime,
                                )}
                              </span>
                            )}
                            {step.status === 'completed' &&
                              step.started_at &&
                              step.completed_at && (
                                <span className="text-xs text-muted-foreground mr-3">
                                  {formatTimeDifference(
                                    step.started_at,
                                    step.completed_at,
                                  )}
                                </span>
                              )}
                            {step.status === 'failed' &&
                              step.started_at &&
                              step.failed_at && (
                                <span className="text-xs text-muted-foreground mr-3">
                                  Failed after{' '}
                                  {formatTimeDifference(
                                    step.started_at,
                                    step.failed_at,
                                  )}
                                </span>
                              )}
                            <span
                              className={`inline-block w-2 h-2 rounded-full mr-2 ${
                                step.status === 'completed'
                                  ? 'bg-green-500'
                                  : step.status === 'started'
                                    ? 'bg-yellow-500 breathing'
                                    : step.status === 'failed'
                                      ? 'bg-red-500'
                                      : step.status === 'created'
                                        ? 'bg-blue-500'
                                        : 'bg-gray-500'
                              }`}
                            ></span>
                            <span className="capitalize text-sm">
                              {step.status === 'created'
                                ? 'waiting'
                                : step.status}
                            </span>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-4 pb-4">
                          {step.status === 'completed' && stepTask?.output && (
                            <div className="mt-2 overflow-auto">
                              <div className="max-h-40 overflow-hidden border border-gray-500/30 rounded-md">
                                <div className="overflow-auto max-h-40">
                                  <JSONHighlighter data={stepTask.output} />
                                </div>
                              </div>
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  });
                })()}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Run Output</h3>
            {runData.status === 'completed' ? (
              <div className="max-h-40 overflow-hidden border border-gray-500/30 rounded-md">
                <div className="overflow-auto max-h-40">
                  <JSONHighlighter data={runData.output} />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Run is not completed yet - no output available
              </p>
            )}
          </div>
        </div>
      ) : (
        <FormMessage
          message={{ message: 'No run data found for this run ID' }}
        />
      )}

      <div className="mt-8">
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            View Raw Data
          </summary>
          <pre className="mt-2 p-2 bg-muted rounded-md text-xs overflow-auto max-h-[500px]">
            {JSON.stringify(runData, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
