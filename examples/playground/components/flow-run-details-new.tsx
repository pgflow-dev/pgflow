'use client';

import { useEffect, useState } from 'react';
import { FlowRun, FlowStep, FlowRunStatus, FlowStepStatus } from '@pgflow/client';
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

interface FlowRunDetailsNewProps {
  flowRun: FlowRun | null;
  loading: boolean;
  error: string | null;
  currentTime: Date;
}

export default function FlowRunDetailsNew({
  flowRun,
  loading,
  error,
  currentTime,
}: FlowRunDetailsNewProps) {
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [stepGroups, setStepGroups] = useState<FlowStep[][]>([]);

  // Known step names for the analyze_website flow
  const knownStepSlugs = ['website', 'summary', 'tags', 'saveToDb'];

  // Set up real-time listeners and organize steps by generation
  useEffect(() => {
    if (!flowRun) {
      setSteps([]);
      setStepGroups([]);
      return;
    }

    // Get all steps from the flow run using known step names
    const allSteps = knownStepSlugs.map(stepSlug => flowRun.step(stepSlug));
    setSteps(allSteps);

    // Group steps by generation (parallel steps share the same generation)
    const generationMap = new Map<number, FlowStep[]>();
    
    allSteps.forEach(step => {
      const generation = step.generation || 0; // Use generation from PgflowClient
      if (!generationMap.has(generation)) {
        generationMap.set(generation, []);
      }
      generationMap.get(generation)!.push(step);
    });

    // Convert to sorted array of groups
    const sortedGroups = Array.from(generationMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, steps]) => steps.sort((a, b) => a.step_slug.localeCompare(b.step_slug)));

    setStepGroups(sortedGroups);

    // Set up real-time listeners for all steps
    const unsubscribers: (() => void)[] = [];

    allSteps.forEach(step => {
      const unsubscribe = step.on('*', (event) => {
        console.log(`Step ${step.step_slug} event:`, event);
        // Force re-render by updating steps array using known step slugs
        const allSteps = knownStepSlugs.map(stepSlug => flowRun.step(stepSlug));
        setSteps([...allSteps]);
      });
      unsubscribers.push(unsubscribe);
    });

    // Listen to run-level events
    const runUnsubscribe = flowRun.on('*', (event) => {
      console.log('FlowRun event:', event);
      // Force re-render using known step slugs
      const allSteps = knownStepSlugs.map(stepSlug => flowRun.step(stepSlug));
      setSteps([...allSteps]);
    });
    unsubscribers.push(runUnsubscribe);

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [flowRun]);

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

  if (!flowRun) {
    return (
      <FormMessage
        message={{ message: 'No flow run data available' }}
      />
    );
  }

  const renderStep = (step: FlowStep, isInGroup: boolean = false) => {
    // Determine status styling
    let statusStyle = '';
    if (step.status === FlowStepStatus.Completed) {
      statusStyle = 'bg-green-500/5 border-green-500/30';
    } else if (step.status === FlowStepStatus.Started) {
      statusStyle = 'bg-yellow-500/5 border-yellow-500/30';
    } else if (step.status === FlowStepStatus.Failed) {
      statusStyle = 'bg-red-500/5 border-red-500/30';
    } else {
      statusStyle = 'bg-blue-500/5 border-blue-500/30';
    }

    return (
      <Collapsible
        key={step.step_slug}
        className={`rounded-lg border ${statusStyle}`}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left">
          <div>
            <h4 className="text-sm font-medium">
              {step.step_slug}
            </h4>
          </div>
          <div className="flex items-center">
            {!isInGroup && (
              <>
                {step.status === FlowStepStatus.Started && step.started_at && (
                  <span className="text-xs text-yellow-600/80 mr-2">
                    {formatRelativeTime(step.started_at, currentTime)}
                  </span>
                )}
                {step.status === FlowStepStatus.Completed &&
                  step.started_at &&
                  step.completed_at && (
                    <span className="text-xs text-green-600/80 mr-2">
                      {formatTimeDifference(step.started_at, step.completed_at)}
                    </span>
                  )}
                {step.status === FlowStepStatus.Failed &&
                  step.started_at &&
                  step.failed_at && (
                    <span className="text-xs text-red-600/80 mr-2">
                      Failed after{' '}
                      {formatTimeDifference(step.started_at, step.failed_at)}
                    </span>
                  )}
              </>
            )}

            <span
              className={`inline-block w-2 h-2 rounded-full ${!isInGroup ? 'mr-1' : ''} ${
                step.status === FlowStepStatus.Completed
                  ? 'bg-green-500'
                  : step.status === FlowStepStatus.Started
                    ? 'bg-yellow-500 breathing'
                    : step.status === FlowStepStatus.Failed
                      ? 'bg-red-500'
                      : 'bg-blue-500'
              }`}
            ></span>
            {!isInGroup && (
              <span className="capitalize text-xs">
                {step.status === FlowStepStatus.Started ? 'running' : step.status}
              </span>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-2 pb-2 w-full bg-background/70 backdrop-blur-sm border-t border-foreground/10">
          {step.status === FlowStepStatus.Completed && step.output && (
            <div className="mt-1 overflow-auto">
              <div className="max-h-32 overflow-hidden border border-gray-500/30 rounded-md">
                <div className="overflow-auto max-h-32">
                  <JSONHighlighter data={step.output} />
                </div>
              </div>
            </div>
          )}
          {step.status === FlowStepStatus.Failed && step.error_message && (
            <div className="mt-1 overflow-auto">
              <div className="max-h-32 overflow-hidden border border-red-500/30 rounded-md">
                <div className="overflow-auto max-h-32">
                  <pre className="bg-red-500/5 rounded-md p-2 text-xs text-white whitespace-pre-wrap">
                    {step.error_message}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="p-2 rounded-lg flex-1 overflow-y-auto border border-muted/30">
      <div className="space-y-3">
        <h3 className="text-base font-medium mb-1">Status</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-1 ${
                flowRun.status === FlowRunStatus.Completed
                  ? 'bg-green-500'
                  : flowRun.status === FlowRunStatus.Started
                    ? 'bg-yellow-500 breathing'
                    : flowRun.status === FlowRunStatus.Failed
                      ? 'bg-red-500'
                      : 'bg-blue-500'
              }`}
            ></span>
            <span className="capitalize text-sm">
              {flowRun.status === FlowRunStatus.Started ? 'running' : flowRun.status}
            </span>
          </div>
          <div className="text-xs">
            {flowRun.status === FlowRunStatus.Started && flowRun.started_at && (
              <span className="text-yellow-600/80">
                Running for {formatTimeDifference(flowRun.started_at, null)}
              </span>
            )}
            {flowRun.status === FlowRunStatus.Completed && flowRun.completed_at && (
              <span className="text-green-600/80">
                Took{' '}
                {formatTimeDifference(flowRun.started_at, flowRun.completed_at)}
              </span>
            )}
            {flowRun.status === FlowRunStatus.Failed && flowRun.failed_at && (
              <span className="text-red-600/80">
                Failed after{' '}
                {formatTimeDifference(flowRun.started_at, flowRun.failed_at)}
              </span>
            )}
          </div>
        </div>

        <div className="mb-2">
          <h4 className="text-sm font-medium mb-1">Run ID:</h4>
          <pre className="capitalize text-xs">{flowRun.run_id}</pre>
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
              <JSONHighlighter data={flowRun.input} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-base font-medium mb-1">
            Steps Status
            <span className="ml-2 text-xs text-muted-foreground">
              Dynamically organized by execution flow
            </span>
          </h3>
          <div className="space-y-3">
            {stepGroups.map((group, groupIndex) => {
              if (group.length === 1) {
                // Single step in this generation
                return (
                  <div key={groupIndex} className="grid grid-cols-1 gap-2">
                    {renderStep(group[0])}
                  </div>
                );
              } else {
                // Multiple parallel steps
                return (
                  <div key={groupIndex} className="mb-0">
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
                    <div className="grid grid-cols-2 gap-2">
                      {group.map(step => renderStep(step, true))}
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>

        <div className="w-full">
          <h3 className="text-base font-medium mb-1">Run Output</h3>
          {flowRun.status === FlowRunStatus.Completed ? (
            <div className="border border-gray-500/30 rounded-md">
              <div className="overflow-auto max-h-[calc(100vh-400px)] w-full">
                <div className="w-full overflow-x-auto">
                  <JSONHighlighter data={flowRun.output} />
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

      <div className="mt-4">
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            View Raw FlowRun Data
          </summary>
          <pre className="mt-1 p-2 bg-muted rounded-md text-xs overflow-auto max-h-[300px]">
            {JSON.stringify({
              run_id: flowRun.run_id,
              flow_slug: flowRun.flow_slug,
              status: flowRun.status,
              input: flowRun.input,
              output: flowRun.output,
              started_at: flowRun.started_at,
              completed_at: flowRun.completed_at,
              failed_at: flowRun.failed_at,
              remaining_steps: flowRun.remaining_steps,
              steps: steps.map(s => ({
                step_slug: s.step_slug,
                status: s.status,
                generation: s.generation,
                deps_slugs: s.deps_slugs,
                started_at: s.started_at,
                completed_at: s.completed_at,
                output: s.output,
                error_message: s.error_message
              }))
            }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}