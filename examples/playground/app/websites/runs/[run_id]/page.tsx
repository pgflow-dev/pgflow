'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FormMessage } from '@/components/form-message';
import {
  fetchFlowRunData,
  observeFlowRun,
  ResultRow,
  RunRow,
  StepStateRow,
  StepTaskRow,
} from '@/lib/db';
import { Json } from '@/supabase/functions/database-types';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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
function formatTimeDifference(startDate: string | null, endDate: string | null): string {
  if (!startDate) return '';
  
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  
  const diffMs = end.getTime() - start.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  
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
function formatRelativeTime(date: string | null): string {
  if (!date) return '';
  
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  
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

function RenderJson(json: Json) {
  return (
    <pre className="p-4 bg-muted rounded-md overflow-auto text-sm">
      {JSON.stringify(json, null, 2)}
    </pre>
  );
}

export default function FlowRunPage() {
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
  const [runData, setRunData] = useState<ResultRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const params = useParams();
  const runId = params.run_id as string;

  useEffect(() => {
    const loadData = async () => {
      if (!runId) return;

      setLoading(true);
      const { data, error } = await fetchFlowRunData(runId);

      if (error) {
        setError(error);
      } else if (data) {
        setRunData(data);
      }

      setLoading(false);
    };

    loadData();

    // Set up handlers for real-time updates
    const handleStepStateUpdate = (
      payload: RealtimePostgresChangesPayload<StepStateRow>,
    ) => {
      console.log('Step state updated:', payload);

      setRunData((prevData) => {
        if (!prevData) return null;

        // Find the index of the updated step state
        const stepStateIndex = prevData.step_states.findIndex(
          (step) => step.step_slug === payload.new.step_slug,
        );

        // Create a new array of step states with the updated one
        const updatedStepStates = [...prevData.step_states];

        if (stepStateIndex !== -1) {
          // Update existing step state
          updatedStepStates[stepStateIndex] = payload.new;
        } else if (payload.eventType === 'INSERT') {
          // Add new step state
          updatedStepStates.push(payload.new);
        }

        // Create a mapping of step_slug to step_index to maintain order
        const stepIndexMap = new Map<string, number>();
        updatedStepStates.forEach((state) => {
          if (state.step && state.step_slug) {
            stepIndexMap.set(state.step_slug, state.step?.step_index || 0);
          }
        });

        // Sort the updated step states using the mapping
        updatedStepStates.sort((a, b) => {
          const aIndex = stepIndexMap.get(a.step_slug) || 0;
          const bIndex = stepIndexMap.get(b.step_slug) || 0;
          return aIndex - bIndex;
        });

        // Return the updated data
        return {
          ...prevData,
          step_states: updatedStepStates,
        } as ResultRow;
      });
    };

    const handleStepTaskUpdate = (
      payload: RealtimePostgresChangesPayload<StepTaskRow>,
    ) => {
      console.log('Step task updated:', payload);

      setRunData((prevData) => {
        if (!prevData) return null;

        // Find the index of the updated step task
        const stepTaskIndex = prevData.step_tasks.findIndex(
          (task) => task.step_slug === payload.new.step_slug,
        );

        // Create a new array of step tasks with the updated one
        const updatedStepTasks = [...prevData.step_tasks];

        if (stepTaskIndex !== -1) {
          // Update existing step task
          updatedStepTasks[stepTaskIndex] = payload.new;
        } else if (payload.eventType === 'INSERT') {
          // Add new step task
          updatedStepTasks.push(payload.new);
        }

        // Create a mapping of step_slug to step_index from step_states to maintain order
        const stepIndexMap = new Map<string, number>();
        prevData.step_states.forEach((state) => {
          if (state.step && state.step_slug) {
            stepIndexMap.set(state.step_slug, state.step?.step_index || 0);
          }
        });

        // Sort the updated step tasks using the mapping
        updatedStepTasks.sort((a, b) => {
          const aIndex = stepIndexMap.get(a.step_slug) || 0;
          const bIndex = stepIndexMap.get(b.step_slug) || 0;
          return aIndex - bIndex;
        });

        // Return the updated data
        return {
          ...prevData,
          step_tasks: updatedStepTasks,
        } as ResultRow;
      });
    };

    // Set up a subscription to get real-time updates
    const subscription = observeFlowRun({
      runId,
      onRunUpdate(payload: RealtimePostgresChangesPayload<RunRow>) {
        console.log('Run updated:', payload);

        // Update only the run data without refetching everything
        setRunData((prevData) => {
          if (!prevData) return null;

          // Create a new object with the updated run data
          return {
            ...prevData,
            ...payload.new,
          } as ResultRow;
        });
      },
      onStepStateUpdate: handleStepStateUpdate,
      onStepTaskUpdate: handleStepTaskUpdate,
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [runId]);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="flex flex-col items-center">
            <div className="h-12 w-12 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-4"></div>
            <p className="text-foreground/60">Loading run data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-lg">
          <h2 className="text-xl font-medium text-destructive mb-2">Error</h2>
          <p className="text-destructive/80">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Flow Run Details</h1>

      <div className="grid grid-cols-1 gap-8">
        <div className="p-6 border rounded-lg shadow-sm">
          <h2 className="text-2xl font-medium mb-4">
            {runData?.flow_slug}: {runId}
          </h2>

          {runData ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Status</h3>
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
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">Run Information</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <dt className="text-sm text-foreground/60">Run input</dt>
                    <dd>
                      <RenderJson json={runData.input} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-foreground/60">Flow</dt>
                    <dd>{runData.flow_slug}</dd>
                    <dt className="text-sm text-foreground/60">
                      Remaining steps
                    </dt>
                    <dd>{runData.remaining_steps}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">Steps Status</h3>
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
                                    Started {formatRelativeTime(step.started_at)}
                                  </span>
                                )}
                                {step.status === 'completed' && step.started_at && step.completed_at && (
                                  <span className="text-xs text-muted-foreground mr-3">
                                    Took {formatTimeDifference(step.started_at, step.completed_at)}
                                  </span>
                                )}
                                {step.status === 'failed' && step.started_at && step.failed_at && (
                                  <span className="text-xs text-muted-foreground mr-3">
                                    Failed after {formatTimeDifference(step.started_at, step.failed_at)}
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
                              {step.status === 'completed' &&
                                stepTask?.output && (
                                  <div className="mt-2 overflow-auto">
                                    <div className="p-2 bg-muted/50 whitespace-break-spaces rounded-md text-xs overflow-auto max-h-40">
                                      <pre class="whitespace-break-spaces ">
                                        {JSON.stringify(
                                          stepTask.output,
                                          null,
                                          2,
                                        )}
                                      </pre>
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
                  <RenderJson json={runData.output} />
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
      </div>
    </div>
  );
}
