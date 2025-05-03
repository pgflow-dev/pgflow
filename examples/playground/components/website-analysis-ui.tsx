'use client';

import { useState, useEffect } from 'react';
import { ResultRow, StepStateRow } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface WebsiteAnalysisUIProps {
  runData: ResultRow | null;
  loading: boolean;
  error: string | null;
  onAnalyzeWebsite: (url: string) => Promise<void>;
  analyzeLoading?: boolean;
  analyzeError?: string | null;
}

export default function WebsiteAnalysisUI({
  runData,
  loading,
  error,
  onAnalyzeWebsite,
  analyzeLoading = false,
  analyzeError = null,
}: WebsiteAnalysisUIProps) {
  const [url, setUrl] = useState('');
  const [analysisExpanded, setAnalysisExpanded] = useState(true);

  // Get ordered step states
  const getOrderedStepStates = (): StepStateRow[] => {
    if (!runData?.step_states) return [];

    // Create a mapping of step_slug to step_index
    const stepIndexMap = new Map<string, number>();
    runData.step_states.forEach((state) => {
      if (state.step && state.step_slug) {
        stepIndexMap.set(state.step_slug, state.step?.step_index || 0);
      }
    });

    // Sort step_states using the mapping
    return [...runData.step_states].sort((a, b) => {
      const aIndex = stepIndexMap.get(a.step_slug) || 0;
      const bIndex = stepIndexMap.get(b.step_slug) || 0;
      return aIndex - bIndex;
    });
  };

  const sortedSteps = getOrderedStepStates();
  const isCompleted = runData?.status === 'completed';
  const isFailed = runData?.status === 'failed';
  const isRunning = runData?.status === 'started';
  const showSteps = runData && (isRunning || isCompleted || isFailed);

  // For summary, check if:
  // 1. We have runData
  // 2. Status is completed OR (the summary task is completed, even if run is still in progress)
  const summaryTaskCompleted = runData?.step_tasks?.some(
    (task) =>
      task.step_slug === 'summary' &&
      task.status === 'completed' &&
      task.output,
  );
  const showSummary = runData && (isCompleted || summaryTaskCompleted);
  const showAnalyzeAnother = runData && (isCompleted || isFailed);

  // Keep analysis section expanded when running or failed, collapse only when completed successfully
  useEffect(() => {
    if (isRunning || isFailed) {
      setAnalysisExpanded(true);
    } else if (isCompleted) {
      setAnalysisExpanded(false);
    }
  }, [isRunning, isCompleted, isFailed, runData?.run_id]);

  // Get website URL from input
  const getWebsiteUrl = (): string => {
    if (!runData?.input) return '';

    // Try to extract URL from input
    const input = runData.input;
    if (typeof input === 'object' && input !== null && 'url' in input) {
      return input.url as string;
    }

    return '';
  };

  // Get analysis summary from step tasks
  const getAnalysisSummary = (): {
    summary: string;
    sentiment: string;
    tags: string[];
  } => {
    console.log('=== Analysis Summary Called ===');
    console.log('isCompleted:', isCompleted);
    console.log('runData.step_tasks:', runData?.step_tasks);

    if (!runData?.step_tasks || runData.step_tasks.length === 0) {
      console.log('No step tasks found in runData');
      return { summary: '', sentiment: 'neutral', tags: [] };
    }

    // Debug: Log the available step tasks
    console.log(
      'Available step tasks:',
      runData.step_tasks.map((task) => ({
        step_slug: task.step_slug,
        status: task.status,
        has_output: !!task.output,
      })),
    );

    try {
      // Find the step tasks by their step_slug exactly as defined in analyze_website.ts
      const summaryTask = runData.step_tasks.find(
        (task) => task.step_slug === 'summary',
      );
      const sentimentTask = runData.step_tasks.find(
        (task) => task.step_slug === 'sentiment',
      );
      const tagsTask = runData.step_tasks.find(
        (task) => task.step_slug === 'tags',
      );

      // Extract summary
      let summary = '';
      if (summaryTask?.output) {
        // Use the output directly as a JSON object
        const summaryOutput = summaryTask.output as any;
        // Look for aiSummary field based on flow definition
        summary = summaryOutput.aiSummary || '';
      }

      // Extract sentiment
      let sentiment = 'neutral';
      if (sentimentTask?.output) {
        // Use the output directly as a JSON object
        const sentimentOutput = sentimentTask.output as any;

        // Handle numerical sentiment using 'score' field based on flow definition
        if (typeof sentimentOutput.score === 'number') {
          if (sentimentOutput.score >= 0.7) sentiment = 'positive';
          else if (sentimentOutput.score < 0.3) sentiment = 'negative';
        }
      }

      // Extract tags
      let tags: string[] = [];
      if (tagsTask?.output) {
        // Based on flow definition, tags task directly returns the keywords array
        const tagsOutput = tagsTask.output;

        // Use output directly as it should be an array of strings
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      // Call the onAnalyzeWebsite callback with the URL
      await onAnalyzeWebsite(url.trim());

      // Clear the input field after submission
      setUrl('');
    }
  };

  const { summary, sentiment, tags } = getAnalysisSummary();
  const websiteUrl = getWebsiteUrl();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-4"></div>
          <p className="text-foreground/60">Loading...</p>
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
      {/* Top bar with analyze form when analysis is completed */}
      {(isCompleted || isFailed) && (
        <div className="mb-6">
          <h3 className="text-base font-medium mb-2">Analyze Website</h3>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-2"
          >
            <Input
              id="url-new"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="flex-1"
              disabled={analyzeLoading}
            />
            <Button type="submit" disabled={analyzeLoading} size="sm">
              {analyzeLoading ? 'Starting...' : 'Analyze'}
            </Button>
          </form>
          {analyzeError && (
            <div className="text-sm text-destructive mt-2">{analyzeError}</div>
          )}

          {/* Example site links */}
          <div className="mt-2 flex items-center text-xs">
            <span className="text-muted-foreground mr-2">Examples:</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  onAnalyzeWebsite('https://reddit.com/r/supabase')
                }
                className="text-green-600 hover:bg-green-50 px-2 py-1 rounded hover:text-green-700"
                disabled={analyzeLoading}
              >
                reddit.com/r/supabase
              </button>
              <button
                onClick={() => onAnalyzeWebsite('https://supabase.com/docs')}
                className="text-green-600 hover:bg-green-50 px-2 py-1 rounded hover:text-green-700"
                disabled={analyzeLoading}
              >
                supabase.com/docs
              </button>
              <button
                onClick={() => onAnalyzeWebsite('https://pgflow.dev')}
                className="text-green-600 hover:bg-green-50 px-2 py-1 rounded hover:text-green-700"
                disabled={analyzeLoading}
              >
                pgflow.dev
              </button>
              <button
                onClick={() => onAnalyzeWebsite('https://firebase.google.com/')}
                className="text-red-600 hover:bg-red-50 px-2 py-1 rounded hover:text-red-700"
                disabled={analyzeLoading}
              >
                Demo Failure
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {/* Initial URL input form - only show when no analysis is running or completed */}
        {!showSteps && !showSummary && (
          <motion.div
            initial={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="url" className="block text-sm font-medium mb-1">
                  Website URL
                </label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  className="w-full"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? 'Analyzing...' : 'Analyze Website'}
              </Button>
            </form>

            {/* Example site links */}
            <div className="mt-2 flex items-center text-xs">
              <span className="text-muted-foreground mr-2">Examples:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onAnalyzeWebsite('https://reddit.com/r/supabase')
                  }
                  className="text-green-600 hover:bg-green-50 px-2 py-1 rounded hover:text-green-700"
                  disabled={loading}
                >
                  reddit.com/r/supabase
                </button>
                <button
                  type="button"
                  onClick={() => onAnalyzeWebsite('https://supabase.com/docs')}
                  className="text-green-600 hover:bg-green-50 px-2 py-1 rounded hover:text-green-700"
                  disabled={loading}
                >
                  supabase.com/docs
                </button>
                <button
                  type="button"
                  onClick={() => onAnalyzeWebsite('https://pgflow.dev')}
                  className="text-green-600 hover:bg-green-50 px-2 py-1 rounded hover:text-green-700"
                  disabled={loading}
                >
                  pgflow.dev
                </button>
                <button
                  type="button"
                  onClick={() => onAnalyzeWebsite('https://failure.com')}
                  className="text-red-600 hover:bg-red-50 px-2 py-1 rounded hover:text-red-700"
                  disabled={loading}
                >
                  Demo Failure
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step-by-step process - only show full header when analysis is running */}
        {showSteps && (isRunning || analysisExpanded) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
            {/* Show the header when running or failed */}
            {(isRunning || isFailed) && (
              <div
                onClick={() => {
                  // Only allow toggling if not failed
                  if (!isFailed) {
                    setAnalysisExpanded(!analysisExpanded);
                  }
                }}
                className={`flex justify-between items-center mb-4 p-2 rounded-md ${
                  isFailed
                    ? 'border border-red-200 bg-red-50/30'
                    : 'cursor-pointer hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-medium">
                    {isFailed ? 'Analysis Failed' : 'Analysis Progress'}
                  </h3>
                  {isRunning && (
                    <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                      Running
                    </span>
                  )}
                  {isFailed && (
                    <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-red-100 text-red-800">
                      Failed
                    </span>
                  )}
                </div>
                {!isFailed &&
                  (analysisExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ))}
              </div>
            )}

            <AnimatePresence>
              {analysisExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8 overflow-hidden"
                >
                  {/* X button with label at the top right corner to close details */}
                  {!isRunning && !isFailed && (
                    <div className="flex justify-end mb-2">
                      <button
                        onClick={() => setAnalysisExpanded(false)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors text-xs border border-muted"
                        aria-label="Close details"
                      >
                        <span>close details</span>
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
                        >
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  )}
                  <div className="p-3 bg-muted rounded-md">
                    <p
                      className="font-medium truncate max-w-full"
                      title={websiteUrl}
                    >
                      {websiteUrl.length > 50
                        ? `${websiteUrl.substring(0, 50)}...`
                        : websiteUrl}
                    </p>
                  </div>
                  {/* Steps are already sorted by the getOrderedStepStates function */}
                  {sortedSteps.map((step, index) => (
                    <motion.div
                      key={step.step_slug}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`flex items-start space-x-4 ${
                        isCompleted && step.status === 'completed'
                          ? 'opacity-80'
                          : step.status === 'created'
                            ? 'opacity-50'
                            : ''
                      }`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${(() => {
                            // Find tasks for this step to check attempts count
                            const stepTasks =
                              runData.step_tasks?.filter(
                                (task) => task.step_slug === step.step_slug,
                              ) || [];

                            // Get the most recent task (usually the one with the highest attempts_count)
                            const latestTask = stepTasks.sort(
                              (a, b) =>
                                (b.attempts_count || 0) -
                                (a.attempts_count || 0),
                            )[0];

                            // Check if this is a retry (attempts_count > 1)
                            const isRetrying =
                              latestTask &&
                              latestTask.attempts_count > 1 &&
                              step.status === 'started';

                            if (step.status === 'completed') {
                              return 'bg-green-500 border-green-500 text-white';
                            } else if (isRetrying) {
                              return 'border-red-500 text-red-500 animate-pulse';
                            } else if (step.status === 'started') {
                              return 'border-yellow-500 text-yellow-500';
                            } else if (step.status === 'failed') {
                              return 'border-red-500 text-red-500';
                            } else {
                              return 'border-gray-300 text-gray-300';
                            }
                          })()}`}
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
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-medium capitalize">
                          {step.step_slug.replace(/_/g, ' ')}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {(() => {
                            // Find tasks for this step to check attempts count
                            const stepTasks =
                              runData.step_tasks?.filter(
                                (task) => task.step_slug === step.step_slug,
                              ) || [];

                            // Get the most recent task (usually the one with the highest attempts_count)
                            const latestTask = stepTasks.sort(
                              (a, b) =>
                                (b.attempts_count || 0) -
                                (a.attempts_count || 0),
                            )[0];

                            // Check if this is a retry (attempts_count > 1)
                            const isRetrying =
                              latestTask &&
                              latestTask.attempts_count > 1 &&
                              step.status === 'started';

                            if (isRetrying) {
                              return `Retrying (Retry ${latestTask.attempts_count - 1})...`;
                            } else if (step.status === 'completed') {
                              return 'Completed';
                            } else if (step.status === 'started') {
                              return 'In progress...';
                            } else if (step.status === 'failed') {
                              return 'Failed';
                            } else {
                              return 'Waiting...';
                            }
                          })()}
                        </p>
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
                                <div className="max-h-40 overflow-hidden border border-red-500/30 rounded-md">
                                  <div className="overflow-auto max-h-40">
                                    <pre className="bg-red-500/5 rounded-md p-4 text-xs text-white whitespace-pre-wrap">
                                      {failedTask.error_message}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            ) : null;
                          })()}
                      </div>
                    </motion.div>
                  ))}

                  {/* Duplicate collapse button at the bottom of expanded details */}
                  {!isRunning && !isFailed && (
                    <div
                      onClick={() => setAnalysisExpanded(false)}
                      className="flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-muted/50 border border-muted-foreground/20 mt-4"
                    >
                      <span className="text-sm font-medium">Hide Details</span>
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Summary view */}
        {showSummary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6 mt-8"
          >
            <div className="mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <h3 className="text-xl font-medium">Analysis Results</h3>
                {!isRunning && (
                  <div
                    onClick={() => setAnalysisExpanded(!analysisExpanded)}
                    className="flex items-center gap-2 px-3 py-1 rounded-md cursor-pointer hover:bg-muted/50 border border-muted-foreground/20 mt-2 sm:mt-0 self-start"
                  >
                    <span className="text-sm font-medium">Details</span>
                    <span
                      className={`inline-flex items-center text-xs px-2 py-1 rounded-full ${
                        runData?.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : runData?.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {runData?.status === 'completed' ? 'OK' : runData?.status}
                    </span>
                    {analysisExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                Website:
              </span>
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-primary hover:underline overflow-hidden"
              >
                {websiteUrl.length > 30
                  ? `${websiteUrl.substring(0, 30)}...`
                  : websiteUrl}
              </a>
            </div>

            <dl className="space-y-6">
              <div className="flex flex-row gap-6">
                <div className="flex flex-col space-y-2 w-1/3">
                  <dt className="text-sm font-medium text-muted-foreground">
                    Sentiment
                  </dt>
                  <dd>
                    <span
                      className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                        sentiment === 'positive'
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
