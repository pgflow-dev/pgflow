'use client';

import { useEffect, useState } from 'react';
import { ResultRow } from '@/lib/db';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import JSONHighlighter from '@/components/json-highlighter';
import { FormMessage } from '@/components/form-message';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import WorkflowDag from '@/components/workflow-dag';

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
  className?: string;
  showTechnicalDetails?: boolean;
}

export default function FlowRunDetails({
  runId,
  runData,
  loading,
  error,
  currentTime,
  className = '',
  showTechnicalDetails = false,
}: FlowRunDetailsProps) {
  const [showDetails, setShowDetails] = useState(showTechnicalDetails);
  const [activeTab, setActiveTab] = useState<string>('steps');

  // Extract useful info
  const isRunning = runData?.status === 'started';
  const isCompleted = runData?.status === 'completed';
  const isFailed = runData?.status === 'failed';

  // Function to get summary data
  const getAnalysisSummary = () => {
    if (!runData?.step_tasks || runData.step_tasks.length === 0) {
      return { summary: '', sentiment: 'neutral', tags: [] };
    }

    try {
      // Find completed tasks
      const summaryTask = runData.step_tasks.find(
        (task) => task.step_slug === 'summary' && task.status === 'completed'
      );
      const sentimentTask = runData.step_tasks.find(
        (task) => task.step_slug === 'sentiment' && task.status === 'completed'
      );
      const tagsTask = runData.step_tasks.find(
        (task) => task.step_slug === 'tags' && task.status === 'completed'
      );

      // Extract summary
      let summary = '';
      if (summaryTask?.output) {
        const summaryOutput = summaryTask.output as any;
        summary = summaryOutput.aiSummary || '';
      }

      // Extract sentiment
      let sentiment = 'neutral';
      if (sentimentTask?.output) {
        const sentimentOutput = sentimentTask.output as any;
        if (typeof sentimentOutput.score === 'number') {
          if (sentimentOutput.score >= 0.7) sentiment = 'positive';
          else if (sentimentOutput.score < 0.3) sentiment = 'negative';
        }
      }

      // Extract tags
      let tags: string[] = [];
      if (tagsTask?.output) {
        const tagsOutput = tagsTask.output;
        if (Array.isArray(tagsOutput)) {
          tags = tagsOutput;
        }
      }

      return { summary, sentiment, tags };
    } catch (e) {
      console.error('Error extracting data from step tasks:', e);
      return { summary: '', sentiment: 'neutral', tags: [] };
    }
  };

  // Extract website URL from input
  const getWebsiteUrl = (): string => {
    if (!runData?.input) return '';
    const input = runData.input;
    if (typeof input === 'object' && input !== null && 'url' in input) {
      return input.url as string;
    }
    return '';
  };

  const { summary, sentiment, tags } = getAnalysisSummary();
  const websiteUrl = getWebsiteUrl();

  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-[30vh] ${className}`}>
        <div className="flex flex-col items-center">
          <div className="h-8 w-8 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-2"></div>
          <p className="text-xs text-foreground/60">Loading run data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 border border-destructive/20 bg-destructive/10 rounded-lg ${className}`}>
        <h2 className="text-lg font-medium text-destructive mb-2">Error</h2>
        <p className="text-destructive/80">{error}</p>
      </div>
    );
  }

  return (
    <div className={`p-4 border rounded-lg shadow-sm ${className}`}>
      {runData ? (
        <div className="space-y-6">
          {/* Unified Status Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div
                className={`h-4 w-4 rounded-full ${runData.status === 'completed'
                    ? 'bg-green-500'
                    : runData.status === 'started'
                      ? 'bg-yellow-500 animate-pulse'
                      : runData.status === 'failed'
                        ? 'bg-red-500'
                        : runData.status === 'created'
                          ? 'bg-blue-500'
                          : 'bg-gray-500'
                  }`}
              ></div>
              <h3 className="text-lg font-medium capitalize">
                {runData.status === 'started' ? 'Running' : runData.status}
              </h3>
              {isRunning && runData.started_at && (
                <span className="text-sm text-yellow-600/80 ml-2">
                  Running for {formatTimeDifference(runData.started_at, null)}
                </span>
              )}
              {isCompleted && runData.completed_at && (
                <span className="text-sm text-green-600/80 ml-2">
                  Completed in {formatTimeDifference(runData.started_at, runData.completed_at)}
                </span>
              )}
              {isFailed && runData.failed_at && (
                <span className="text-sm text-red-600/80 ml-2">
                  Failed after {formatTimeDifference(runData.started_at, runData.failed_at)}
                </span>
              )}
            </div>

            {/* Technical Details Toggle */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center space-x-1 text-xs px-3 py-1.5 rounded-md hover:bg-muted border"
            >
              {showDetails ? (
                <>
                  <EyeOff size={14} />
                  <span>Hide Technical Details</span>
                </>
              ) : (
                <>
                  <Eye size={14} />
                  <span>Show Technical Details</span>
                </>
              )}
            </button>
          </div>

          {/* Website URL Display */}
          {websiteUrl && (
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">Website:</span>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 truncate"
                >
                  {websiteUrl}
                </a>
              </div>
            </div>
          )}

          {/* Workflow DAG Diagram */}
          <div className="mb-6 p-3 bg-muted/30 border border-muted rounded-md">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Workflow Structure</h4>
              <span className="text-xs text-muted-foreground">Data Pipeline Diagram</span>
            </div>
            <WorkflowDag stepStates={runData?.step_states || []} stepTasks={runData?.step_tasks || []} />
          </div>

          {/* Tabs for Analysis Results / Technical Details */}
          <Tabs
            defaultValue="steps"
            className="w-full"
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabsList className="mb-4 grid grid-cols-3">
              <TabsTrigger value="steps">Process Steps</TabsTrigger>
              <TabsTrigger value="results" disabled={!isCompleted}>Results</TabsTrigger>
              <TabsTrigger value="technical" className={showDetails ? '' : 'hidden'}>Technical Data</TabsTrigger>
            </TabsList>

            {/* Process Steps Tab */}
            <TabsContent value="steps" className="space-y-4">
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
                  const parallelStepSlugs = ['summary', 'sentiment', 'tags'];
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
                    isParallel: boolean = false,
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
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left">
                          <div className="flex items-center">
                            <div
                              className={`flex items-center justify-center w-8 h-8 rounded-full border-2 mr-3 ${step.status === 'completed'
                                  ? 'bg-green-500 border-green-500 text-white'
                                  : isRetrying
                                    ? 'border-red-500 text-red-500 animate-pulse'
                                    : step.status === 'started'
                                      ? 'border-yellow-500 text-yellow-500'
                                      : step.status === 'failed'
                                        ? 'border-red-500 text-red-500'
                                        : 'border-gray-300 text-gray-300'
                                }`}
                            >
                              {step.status === 'completed' ? (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              ) : (
                                <span>{index + 1}</span>
                              )}
                            </div>
                            <h4 className="text-base font-medium capitalize">
                              {step.step_slug.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase()}
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

                            <span className="capitalize text-xs px-2 py-0.5 rounded-full mr-2 bg-muted">
                              {isRetrying
                                ? `Retry ${latestTask.attempts_count - 1}`
                                : step.status === 'created'
                                  ? 'Waiting'
                                  : step.status === 'started'
                                    ? 'Running'
                                    : step.status}
                            </span>
                            {step.status === 'completed' ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 pb-3 w-full bg-background/70 backdrop-blur-sm border-t border-foreground/10">
                          {step.status === 'completed' && stepTask?.output && (
                            <div className="mt-2 space-y-2">
                              {/* Step output summary */}
                              {step.step_slug === 'summary' && (
                                <div className="p-3 bg-muted/50 rounded-md">
                                  <h5 className="font-medium mb-1">Summary</h5>
                                  <p className="text-sm whitespace-pre-line">{(stepTask.output as any).aiSummary || 'No summary available'}</p>
                                </div>
                              )}

                              {step.step_slug === 'sentiment' && (
                                <div className="p-3 bg-muted/50 rounded-md">
                                  <h5 className="font-medium mb-1">Sentiment Analysis</h5>
                                  <div className="flex items-center">
                                    <span
                                      className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${sentiment === 'positive'
                                          ? 'bg-green-100 text-green-800'
                                          : sentiment === 'negative'
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-blue-100 text-blue-800'
                                        }`}
                                    >
                                      {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
                                    </span>
                                    {showDetails && (
                                      <span className="ml-2 text-sm">Score: {(stepTask.output as any).score?.toFixed(2) || 'N/A'}</span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {step.step_slug === 'tags' && (
                                <div className="p-3 bg-muted/50 rounded-md">
                                  <h5 className="font-medium mb-1">Tags</h5>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {Array.isArray(stepTask.output) && stepTask.output.length > 0 ? (
                                      stepTask.output.map((tag, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-xs">{tag}</Badge>
                                      ))
                                    ) : (
                                      <span className="text-sm text-muted-foreground">No tags available</span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Technical details for all steps */}
                              {showDetails && (
                                <div className="mt-2 overflow-auto">
                                  <div className="overflow-hidden border border-gray-500/30 rounded-md">
                                    <div className="overflow-auto">
                                      <JSONHighlighter data={stepTask.output} />
                                    </div>
                                  </div>
                                </div>
                              )}
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
                                <div className="mt-2 overflow-auto">
                                  <div className="overflow-hidden border border-red-500/30 rounded-md">
                                    <div className="overflow-auto">
                                      <pre className="bg-red-500/5 rounded-md p-3 text-sm text-white whitespace-pre-wrap">
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
                    <div className="space-y-4">
                      {/* Website step (first step) */}
                      {websiteStep && (
                        <div className="grid grid-cols-1 gap-3">
                          {renderStep(websiteStep, 0)}
                        </div>
                      )}

                      {/* Parallel steps with note */}
                      {parallelSteps.length > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-muted-foreground italic">
                              Parallel Processing Steps
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
                              Running in parallel
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {parallelSteps.map((step, index) =>
                              renderStep(step, index, true),
                            )}
                          </div>
                        </div>
                      )}

                      {/* SaveToDb step (last step) */}
                      {saveToDbStep && (
                        <div className="grid grid-cols-1 gap-3">
                          {renderStep(saveToDbStep, 1)}
                        </div>
                      )}

                      {/* Any other regular steps */}
                      {otherRegularSteps.length > 0 && (
                        <div className="grid grid-cols-1 gap-3 mt-3">
                          {otherRegularSteps.map((step, index) =>
                            renderStep(step, index + 2),
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
            </TabsContent>

            {/* Analysis Results Tab */}
            <TabsContent value="results" className="space-y-6">
              {isCompleted && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                    <h3 className="text-xl font-medium">Analysis Results</h3>
                  </div>

                  <dl className="space-y-6">
                    <div className="flex flex-row gap-6">
                      <div className="flex flex-col space-y-2 w-1/3">
                        <dt className="text-sm font-medium text-muted-foreground">
                          Sentiment
                        </dt>
                        <dd>
                          <span
                            className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${sentiment === 'positive'
                                ? 'bg-green-100 text-green-800'
                                : sentiment === 'negative'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                          >
                            {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
                          </span>
                        </dd>
                      </div>

                      <div className="flex flex-col space-y-2 w-2/3">
                        <dt className="text-sm font-medium text-muted-foreground">
                          Tags
                        </dt>
                        <dd className="flex flex-wrap gap-2">
                          {tags.length > 0 ? (
                            tags.map((tag, index) => (
                              <Badge
                                key={index}
                                variant="secondary"
                                className="text-xs"
                              >
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              No tags available
                            </span>
                          )}
                        </dd>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <dt className="text-sm font-medium text-muted-foreground">
                        Summary
                      </dt>
                      <dd className="text-foreground/90 whitespace-pre-line leading-relaxed">
                        {summary}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </TabsContent>

            {/* Technical Data Tab */}
            <TabsContent value="technical" className="space-y-6">
              {/* Run ID */}
              <div className="mb-2">
                <h4 className="text-sm font-medium mb-1">Run ID:</h4>
                <pre className="capitalize text-xs bg-muted p-2 rounded-md">{runId}</pre>
              </div>

              {/* Run Input */}
              <div>
                <h4 className="text-sm font-medium mb-1">
                  Run Input
                  <span className="ml-2 text-xs text-muted-foreground">
                    JSON used to start the flow
                  </span>
                </h4>
                <div className="overflow-hidden border border-gray-500/30 rounded-md">
                  <div className="overflow-auto">
                    <JSONHighlighter data={runData.input} />
                  </div>
                </div>
              </div>

              {/* Run Output */}
              <div>
                <h4 className="text-sm font-medium mb-1">Run Output</h4>
                {runData.status === 'completed' ? (
                  <div className="overflow-hidden border border-gray-500/30 rounded-md">
                    <div className="overflow-auto">
                      <JSONHighlighter data={runData.output} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Run is not completed yet - no output available
                  </p>
                )}
              </div>

              {/* Raw Data */}
              <div>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground mb-1">
                    View Raw Run Data
                  </summary>
                  <pre className="p-2 bg-muted rounded-md text-xs overflow-auto max-h-[300px]">
                    {JSON.stringify(runData, null, 2)}
                  </pre>
                </details>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <FormMessage
          message={{ message: 'No run data found for this run ID' }}
        />
      )}
    </div>
  );
}
