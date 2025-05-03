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

  // Get sorted step states
  const getSortedStepStates = (): StepStateRow[] => {
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

  const sortedSteps = getSortedStepStates();
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

  // Keep analysis section expanded when running, collapse when completed
  useEffect(() => {
    if (isRunning) {
      setAnalysisExpanded(true);
    } else if (isCompleted || isFailed) {
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
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
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
            {/* Only show the full header when running */}
            {isRunning && (
              <div 
                onClick={() => setAnalysisExpanded(!analysisExpanded)}
                className="flex justify-between items-center mb-4 cursor-pointer hover:bg-muted/50 p-2 rounded-md"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-medium">Analysis Progress</h3>
                  <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                    Running
                  </span>
                </div>
                {analysisExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
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
                  {!isRunning && (
                    <div className="flex justify-end mb-2">
                      <button
                        onClick={() => setAnalysisExpanded(false)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors text-xs border border-muted"
                        aria-label="Close details"
                      >
                        <span>close details</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                          className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                            step.status === 'completed'
                              ? 'bg-green-500 border-green-500 text-white'
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
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-medium capitalize">
                          {step.step_slug.replace(/_/g, ' ')}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {step.status === 'completed'
                            ? 'Completed'
                            : step.status === 'started'
                              ? 'In progress...'
                              : step.status === 'failed'
                                ? 'Failed'
                                : 'Waiting...'}
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
                  {!isRunning && (
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
                    <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full ${
                      runData?.status === 'completed' 
                        ? 'bg-green-100 text-green-800' 
                        : runData?.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}>
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
