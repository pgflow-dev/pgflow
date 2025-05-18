'use client';

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { ResultRow, StepStateRow } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { exampleLinks } from '@/lib/example-links';
import { logger } from '@/utils/utils';

// Dynamic import for framer-motion components
const MotionComponents = lazy(() => import('./motion-components'));

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

  // Fallback for when motion components are loading
  const MotionFallback = () => <div>Loading animation components...</div>;

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
                  className={`${
                    link.variant === 'success'
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

      <Suspense fallback={<MotionFallback />}>
        <MotionComponents
          websiteUrl={websiteUrl}
          getOrderedStepStates={getOrderedStepStates}
          getOrderedStepTasks={getOrderedStepTasks}
          analysisExpanded={analysisExpanded}
          setAnalysisExpanded={setAnalysisExpanded}
          handleSubmit={handleSubmit}
          url={url}
          setUrl={setUrl}
          loading={loading}
          analyzeLoading={analyzeLoading}
          onAnalyzeWebsite={onAnalyzeWebsite}
          exampleLinks={exampleLinks}
          showSteps={showSteps}
          showSummary={showSummary}
          isRunning={isRunning}
          isCompleted={isCompleted}
          isFailed={isFailed}
          summary={summary}
          tags={tags}
        />
      </Suspense>
    </div>
  );
}