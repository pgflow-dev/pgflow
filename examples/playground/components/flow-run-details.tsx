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

// Format time difference in a concise way (e.g., "5s", "3m 45s", "2h 15m")
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
    return '< 1s';
  }

  if (diffSec < 60) {
    return `${diffSec}s`;
  }

  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Format relative time in a concise way (e.g., "3s ago", "5m ago")
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
    return '0s';
  }

  if (diffSec < 60) {
    return `${diffSec}s`;
  }

  const minutes = Math.floor(diffSec / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d`;
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
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <div className="flex flex-col items-center">
          <div className="h-8 w-8 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-2"></div>
          <p className="text-xs text-foreground/60">Loading run data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-2 border border-destructive/20 bg-destructive/10 rounded-lg">
        <h2 className="text-base font-medium text-destructive mb-1">Error</h2>
        <p className="text-xs text-destructive/80">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-2 border rounded-lg shadow-sm flex-1 overflow-y-auto">
      {runData ? (
        <div className="space-y-3">
          <h3 className="text-base font-medium mb-1">Status</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span
                className={`inline-block w-2 h-2 rounded-full mr-1 ${
                  runData.status === 'completed'
                    ? 'bg-green-500'
                    : runData.status === 'started'
                      ? 'bg-yellow-500 breathing'
                      : runData.status === 'failed'
                        ? 'bg-red-500'
                        : runData.status === 'error' || runData.status === 'cancelled'
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                }`}
              ></span>
              <span className="capitalize text-sm">
                {runData.status === 'started' ? 'running' : runData.status}
              </span>
            </div>
            <div className="text-xs">
              {runData.status === 'started' && runData.started_at && (
                <span className="text-yellow-600/80">
                  Running for {formatTimeDifference(runData.started_at, null)}
                </span>
              )}
              {runData.status === 'completed' && runData.completed_at && (
                <span className="text-green-600/80">
                  Took{' '}
                  {formatTimeDifference(
                    runData.started_at,
                    runData.completed_at,
                  )}
                </span>
              )}
              {runData.status === 'failed' && runData.failed_at && (
                <span className="text-red-600/80">
                  Failed after{' '}
                  {formatTimeDifference(runData.started_at, runData.failed_at)}
                </span>
              )}
            </div>
          </div>

          <div className="mb-2">
            <h4 className="text-sm font-medium mb-1">Run ID:</h4>
            <pre className="capitalize text-xs">{runId}</pre>
          </div>

          <div>
            <h3 className="text-base font-medium mb-1">
              Run Input
              <span className="ml-2 text-xs text-muted-foreground">
                JSON used to start the flow
              </span>
            </h3>
            <div className="max-h-36 overflow-hidden border border-gray-500/30 rounded-md">
              <div className="overflow-auto max-h-36">
                <JSONHighlighter data={runData.input} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-base font-medium mb-1">
              Steps Status
              <span className="ml-2 text-xs text-muted-foreground">
                Click steps to view details
              </span>
            </h3>
            <div>
              {runData.step_states &&
                (() => {
                  // Sort step_states directly by step.step_index
                  const sortedStepStates = [...runData.step_states].sort(
                    (a, b) => {
                      const aIndex = a.step?.step_index || 0;
                      const bIndex = b.step?.step_index || 0;
                      return aIndex - bIndex;
                    },
                  );

                  // Group parallel steps based on flow definition
                  // We're specifically looking for summary and tags steps that run in parallel
                  const parallelStepSlugs = ['summary', 'tags'];
                  const parallelSteps = sortedStepStates.filter((step) =>
                    parallelStepSlugs.includes(step.step_slug),
                  );

                  // Other steps will be displayed normally
                  const regularSteps = sortedStepStates.filter(
                    (step) => !parallelStepSlugs.includes(step.step_slug),
                  );

                  // Function to render a step
                  const renderStep = (
                    step: any,
                    index: number,
                    isParallel = false,
                  ) => {
                    // Find the corresponding step tasks for this step
                    const stepTasks = runData.step_tasks
                      ?.filter((task) => task.step_slug === step.step_slug)
                      .sort(
                        (a, b) => (a.step_index || 0) - (b.step_index || 0),
                      );

                    // Get the completed task with output
                    const stepTask = stepTasks?.find(
                      (task) => task.status === 'completed',
                    );

                    // Get the pre-sorted step tasks
                    const latestTask =
                      stepTasks && stepTasks.length > 0
                        ? stepTasks.sort(
                            (a, b) =>
                              (b.attempts_count || 0) - (a.attempts_count || 0),
                          )[0]
                        : null;

                    // Check if this is a retry (attempts_count > 1)
                    const isRetrying =
                      latestTask &&
                      latestTask.attempts_count > 1 &&
                      step.status === 'started';

                    // Define status-based styles
                    let statusStyle = '';
                    if (step.status === 'completed') {
                      statusStyle = 'bg-green-500/5 border-green-500/30';
                    } else if (isRetrying) {
                      statusStyle =
                        'bg-red-500/5 border-red-500/30 animate-pulse';
                    } else if (step.status === 'started') {
                      statusStyle = 'bg-yellow-500/5 border-yellow-500/30';
                    } else if (step.status === 'failed') {
                      statusStyle = 'bg-red-500/5 border-red-500/30';
                    } else if (step.status === 'created') {
                      statusStyle = 'bg-blue-500/5 border-blue-500/30';
                    } else {
                      statusStyle = 'bg-gray-500/5 border-gray-500/30';
                    }

                    return (
                      <Collapsible
                        key={index}
                        className={`rounded-lg border ${statusStyle}`}
                      >
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left">
                          <div>
                            <h4 className="text-sm font-medium">
                              {step.step_slug}
                            </h4>
                          </div>
                          <div className="flex items-center">
                            {!isParallel && (
                              <>
                                {step.status === 'started' &&
                                  step.started_at && (
                                    <span className="text-xs text-yellow-600/80 mr-2">
                                      {formatRelativeTime(
                                        step.started_at,
                                        currentTime,
                                      )}
                                    </span>
                                  )}
                                {step.status === 'completed' &&
                                  step.started_at &&
                                  step.completed_at && (
                                    <span className="text-xs text-green-600/80 mr-2">
                                      {formatTimeDifference(
                                        step.started_at,
                                        step.completed_at,
                                      )}
                                    </span>
                                  )}
                                {step.status === 'failed' &&
                                  step.started_at &&
                                  step.failed_at && (
                                    <span className="text-xs text-red-600/80 mr-2">
                                      Failed after{' '}
                                      {formatTimeDifference(
                                        step.started_at,
                                        step.failed_at,
                                      )}
                                    </span>
                                  )}
                              </>
                            )}

                            <span
                              className={`inline-block w-2 h-2 rounded-full ${!isParallel ? 'mr-1' : ''} ${
                                step.status === 'completed'
                                  ? 'bg-green-500'
                                  : isRetrying
                                    ? 'bg-red-500 breathing'
                                    : step.status === 'started'
                                      ? 'bg-yellow-500 breathing'
                                      : step.status === 'failed'
                                        ? 'bg-red-500'
                                        : step.status === 'error' || step.status === 'cancelled'
                                          ? 'bg-red-500'
                                          : 'bg-blue-500'
                              }`}
                            ></span>
                            {!isParallel && (
                              <span className="capitalize text-xs">
                                {isRetrying
                                  ? `retrying (retry ${latestTask.attempts_count - 1})`
                                  : step.status === 'error' || step.status === 'cancelled'
                                    ? step.status
                                    : step.status === 'started'
                                      ? 'running'
                                      : step.status}
                              </span>
                            )}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-2 pb-2 w-full bg-background/70 backdrop-blur-sm border-t border-foreground/10">
                          {step.status === 'completed' && stepTask?.output && (
                            <div className="mt-1 overflow-auto">
                              <div className="max-h-32 overflow-hidden border border-gray-500/30 rounded-md">
                                <div className="overflow-auto max-h-32">
                                  <JSONHighlighter data={stepTask.output} />
                                </div>
                              </div>
                            </div>
                          )}
                          {step.status === 'failed' &&
                            (() => {
                              // Find the failed task for this step
                              const failedTask = runData.step_tasks?.find(
                                (task) =>
                                  task.step_slug === step.step_slug &&
                                  task.status === 'failed' &&
                                  task.error_message,
                              );

                              return failedTask?.error_message ? (
                                <div className="mt-1 overflow-auto">
                                  <div className="max-h-32 overflow-hidden border border-red-500/30 rounded-md">
                                    <div className="overflow-auto max-h-32">
                                      <pre className="bg-red-500/5 rounded-md p-2 text-xs text-white whitespace-pre-wrap">
                                        {failedTask.error_message}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              ) : null;
                            })()}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  };

                  // Separate website and saveToDb steps to place parallel steps between them
                  const websiteStep = regularSteps.find(
                    (step) => step.step_slug === 'website',
                  );
                  const saveToDbStep = regularSteps.find(
                    (step) => step.step_slug === 'saveToDb',
                  );
                  const otherRegularSteps = regularSteps.filter(
                    (step) =>
                      step.step_slug !== 'website' &&
                      step.step_slug !== 'saveToDb',
                  );

                  return (
                    <div className="space-y-3">
                      {/* Website step (first step) */}
                      {websiteStep && (
                        <div className="grid grid-cols-1 gap-2 mb-6">
                          {renderStep(websiteStep, 0)}
                        </div>
                      )}

                      {/* Parallel steps with note */}
                      {parallelSteps.length > 0 && (
                        <div className="mb-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-muted-foreground italic">
                              Following steps run in parallel
                            </span>
                            <span className="text-xs flex items-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="mr-1"
                              >
                                <path d="M12 22v-6M9 8V2M15 8V2M6 8a3 3 0 0 1 3 3v1M18 8a3 3 0 0 0-3 3v1M12 19a3 3 0 0 1-3-3v-1M12 19a3 3 0 0 0 3-3v-1"></path>
                              </svg>
                              Parallel Processing
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 relative step-container">
                            {parallelSteps.map((step, index) =>
                              renderStep(step, index, true),
                            )}
                          </div>
                          <style jsx>{`
                            .step-container {
                              margin-bottom: 2rem;
                            }
                            .step-container > :global(*) {
                              height: 41px; /* Match the height of regular steps (label + padding) */
                            }
                            .step-container > :global(*[data-state='open']) {
                              height: auto;
                            }
                          `}</style>
                        </div>
                      )}

                      {/* SaveToDb step (last step) */}
                      {saveToDbStep && (
                        <div className="grid grid-cols-1 gap-2">
                          {renderStep(saveToDbStep, 1)}
                        </div>
                      )}

                      {/* Any other regular steps */}
                      {otherRegularSteps.length > 0 && (
                        <div className="grid grid-cols-1 gap-2 mt-3">
                          {otherRegularSteps.map((step, index) =>
                            renderStep(step, index + 2),
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>
          </div>

          <div className="w-full">
            <h3 className="text-base font-medium mb-1">Run Output</h3>
            {runData.status === 'completed' ? (
              <div className="border border-gray-500/30 rounded-md">
                <div className="overflow-auto max-h-[calc(100vh-400px)] w-full">
                  <div className="w-full overflow-x-auto">
                    <JSONHighlighter data={runData.output} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
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

      <div className="mt-4">
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            View Raw Data
          </summary>
          <pre className="mt-1 p-2 bg-muted rounded-md text-xs overflow-auto max-h-[300px]">
            {JSON.stringify(runData, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
