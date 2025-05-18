'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResultRow, StepStateRow } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { exampleLinks } from '@/lib/example-links';
import { logger } from '@/utils/utils';

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

  // Get ordered step states - memoized to avoid expensive sorting on every render
  const getOrderedStepStates = useMemo(() => {
    if (!runData?.step_states) return [];

    // Sort step_states directly by step.step_index
    return [...runData.step_states].sort((a, b) => {
      const aIndex = a.step?.step_index || 0;
      const bIndex = b.step?.step_index || 0;
      return aIndex - bIndex;
    });
  }, [runData?.step_states]);

  // Memoize all step tasks grouped by slug to avoid expensive filtering/sorting on each render
  const tasksByStepSlug = useMemo(() => {
    if (!runData?.step_tasks) return {};
    
    // Create a map of step_slug to sorted tasks
    const taskMap: Record<string, any[]> = {};
    
    // Group tasks by step_slug
    runData.step_tasks.forEach(task => {
      if (!taskMap[task.step_slug]) {
        taskMap[task.step_slug] = [];
      }
      taskMap[task.step_slug].push(task);
    });
    
    // Sort each group of tasks
    for (const [slug, tasks] of Object.entries(taskMap)) {
      tasks.sort((a, b) => (a.step_index || 0) - (b.step_index || 0));
    }
    
    return taskMap;
  }, [runData?.step_tasks]);
  
  // Get ordered step tasks for a specific step
  const getOrderedStepTasks = (stepSlug: string): any[] => {
    return tasksByStepSlug[stepSlug] || [];
  };

  // No need to re-execute the memoized function here
  const isCompleted = runData?.status === 'completed';
  const isFailed = runData?.status === 'failed';
  const isRunning = runData?.status === 'started';
  const showSteps = runData && (isRunning || isCompleted || isFailed);

  // For summary, check if:
  // 1. We have runData
  // 2. Status is completed (only show when the entire flow is completed)
  const summaryTaskCompleted = runData?.step_tasks?.some(
    (task) =>
      task.step_slug === 'summary' &&
      task.status === 'completed' &&
      task.output,
  );
  const showSummary = runData && isCompleted;
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

  // Get analysis summary from step tasks - memoized to avoid recalculation on each render
  const getAnalysisSummary = useMemo(() => {
    logger.log('=== Analysis Summary Called ===');
    logger.log('isCompleted:', isCompleted);
    logger.log('showSummary:', showSummary);
    logger.log('runData.step_tasks:', runData?.step_tasks);

    if (!runData?.step_tasks || runData.step_tasks.length === 0) {
      logger.log('No step tasks found in runData');
      return { summary: '', tags: [] };
    }

    // Debug: Log the available step tasks
    logger.log(
      'Available step tasks:',
      runData.step_tasks.map((task) => ({
        step_slug: task.step_slug,
        status: task.status,
        has_output: !!task.output,
      })),
    );

    try {
      // Find the step tasks by their step_slug but use our ordered tasks
      const summaryTasks = getOrderedStepTasks('summary');
      const tagsTasks = getOrderedStepTasks('tags');

      // Get the completed tasks
      const summaryTask = summaryTasks.find(
        (task) => task.status === 'completed',
      );
      const tagsTask = tagsTasks.find((task) => task.status === 'completed');

      // Extract summary
      let summary = '';
      if (summaryTask?.output) {
        // Use the output directly as a JSON object
        const summaryOutput = summaryTask.output as any;
        // Look for aiSummary field based on flow definition
        summary = summaryOutput || '';
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

      return { summary, tags };
    } catch (e) {
      logger.error('Error extracting data from step tasks:', e);
      return { summary: '', tags: [] };
    }
  }, [runData?.step_tasks, isCompleted, showSummary, getOrderedStepTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      // Call the onAnalyzeWebsite callback with the URL
      await onAnalyzeWebsite(url.trim());

      // Clear the input field after submission
      setUrl('');
    }
  };

  // Destructure values from memoized result
  const { summary, tags } = getAnalysisSummary;
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
    <div className="p-6 mt-4 bg-muted/30 rounded-lg">
      {/* Top bar with analyze form when analysis is completed */}
      {(isCompleted || isFailed) && (
        <div className="mb-6">
          <h3 className="text-base font-medium mb-2">
            Analyze Website
            <span className="ml-2 text-xs text-muted-foreground">
              Triggers a multi-step workflow using <strong>pgflow</strong>
            </span>
          </h3>
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
              {exampleLinks.map((link) => (
                <button
                  key={link.url}
                  onClick={() => onAnalyzeWebsite(link.url)}
                  className={`${link.variant === 'success'
                      ? 'text-green-600 hover:bg-green-50 hover:text-green-700'
                      : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                    } px-2 py-1 rounded`}
                  disabled={analyzeLoading}
                >
                  {link.label}
                </button>
              ))}
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
                {exampleLinks.map((link) => (
                  <button
                    key={link.url}
                    type="button"
                    onClick={() => onAnalyzeWebsite(link.url)}
                    className={`${link.variant === 'success'
                        ? 'text-green-600 hover:bg-green-50 hover:text-green-700'
                        : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                      } px-2 py-1 rounded`}
                    disabled={loading}
                  >
                    {link.label}
                  </button>
                ))}
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
                className={`flex justify-between items-center mb-4 p-2 rounded-md ${isFailed
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
                  {getOrderedStepStates.map((step, index) => (
                    <motion.div
                      key={step.step_slug}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`flex items-start space-x-4 ${isCompleted && step.status === 'completed'
                          ? 'opacity-80'
                          : step.status === 'created'
                            ? 'opacity-50'
                            : ''
                        }`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${(() => {
                            // Use the getOrderedStepTasks function to get pre-ordered tasks
                            const orderedStepTasks = getOrderedStepTasks(
                              step.step_slug,
                            );

                            // Get the most recent task (usually the one with the highest attempts_count)
                            const latestTask =
                              orderedStepTasks.length > 0
                                ? [...orderedStepTasks].sort(
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
                            // Use the getOrderedStepTasks function to get pre-ordered tasks
                            const orderedStepTasks = getOrderedStepTasks(
                              step.step_slug,
                            );

                            // Get the most recent task (usually the one with the highest attempts_count)
                            const latestTask =
                              orderedStepTasks.length > 0
                                ? [...orderedStepTasks].sort(
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
                            // Get the ordered tasks and find the failed one
                            const orderedStepTasks = getOrderedStepTasks(
                              step.step_slug,
                            );
                            const failedTask = orderedStepTasks.find(
                              (task) =>
                                task.status === 'failed' && task.error_message,
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
