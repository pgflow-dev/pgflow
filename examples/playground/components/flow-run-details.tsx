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
                        : runData.status === 'created'
                          ? 'bg-blue-500'
                          : 'bg-gray-500'
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
            <div className="grid grid-cols-1 md:grid-cols-1 gap-2">
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

                  return sortedStepStates.map((step, index) => {
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

                    return (
                      <Collapsible
                        key={index}
                        className={`mb-1 rounded-lg border ${(() => {
                          // Get the pre-sorted step tasks from above
                          const latestTask =
                            stepTasks && stepTasks.length > 0
                              ? stepTasks.sort(
                                  (a, b) =>
                                    (b.attempts_count || 0) -
                                    (a.attempts_count || 0),
                                )[0]
                              : null;

                          // Check if this is a retry (attempts_count > 1)
                          const isRetrying =
                            latestTask &&
                            latestTask.attempts_count > 1 &&
                            step.status === 'started';

                          if (step.status === 'completed') {
                            return 'bg-green-500/5 border-green-500/30';
                          } else if (isRetrying) {
                            return 'bg-red-500/5 border-red-500/30 animate-pulse';
                          } else if (step.status === 'started') {
                            return 'bg-yellow-500/5 border-yellow-500/30';
                          } else if (step.status === 'failed') {
                            return 'bg-red-500/5 border-red-500/30';
                          } else if (step.status === 'created') {
                            return 'bg-blue-500/5 border-blue-500/30';
                          } else {
                            return 'bg-gray-500/5 border-gray-500/30';
                          }
                        })()}`}
                      >
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left">
                          <div>
                            <h4 className="text-sm font-medium">
                              {step.step_slug}
                            </h4>
                          </div>
                          <div className="flex items-center">
                            {step.status === 'started' && step.started_at && (
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
                            {(() => {
                              // Use the pre-sorted step tasks from above
                              const latestTask =
                                stepTasks && stepTasks.length > 0
                                  ? stepTasks.sort(
                                      (a, b) =>
                                        (b.attempts_count || 0) -
                                        (a.attempts_count || 0),
                                    )[0]
                                  : null;

                              // Check if this is a retry (attempts_count > 1)
                              const isRetrying =
                                latestTask &&
                                latestTask.attempts_count > 1 &&
                                step.status === 'started';

                              return (
                                <span
                                  className={`inline-block w-2 h-2 rounded-full mr-1 ${
                                    step.status === 'completed'
                                      ? 'bg-green-500'
                                      : isRetrying
                                        ? 'bg-red-500 breathing'
                                        : step.status === 'started'
                                          ? 'bg-yellow-500 breathing'
                                          : step.status === 'failed'
                                            ? 'bg-red-500'
                                            : step.status === 'created'
                                              ? 'bg-blue-500'
                                              : 'bg-gray-500'
                                  }`}
                                ></span>
                              );
                            })()}
                            <span className="capitalize text-xs">
                              {(() => {
                                // Use the pre-sorted step tasks from above
                                const latestTask =
                                  stepTasks && stepTasks.length > 0
                                    ? stepTasks.sort(
                                        (a, b) =>
                                          (b.attempts_count || 0) -
                                          (a.attempts_count || 0),
                                      )[0]
                                    : null;

                                // Check if this is a retry (attempts_count > 1)
                                const isRetrying =
                                  latestTask &&
                                  latestTask.attempts_count > 1 &&
                                  step.status === 'started';

                                if (isRetrying) {
                                  return `retrying (retry ${latestTask.attempts_count - 1})`;
                                } else if (step.status === 'created') {
                                  return 'waiting';
                                } else {
                                  return step.status;
                                }
                              })()}
                            </span>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-2 pb-2">
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
                  });
                })()}
            </div>
          </div>

          <div>
            <h3 className="text-base font-medium mb-1">Run Output</h3>
            {runData.status === 'completed' ? (
              <div className="max-h-36 overflow-hidden border border-gray-500/30 rounded-md">
                <div className="overflow-auto max-h-36">
                  <JSONHighlighter data={runData.output} />
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
