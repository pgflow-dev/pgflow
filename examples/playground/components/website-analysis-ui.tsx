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

// Define analysis data type
interface AnalysisData {
  summary: string;
  tags: string[];
  dataReady: boolean;
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
    
    // Group tasks by step_slug and create a composite key for stable identification
    runData.step_tasks.forEach(task => {
      // Create a stable key for this task based on the composite primary key fields
      const stepSlug = task.step_slug;
      
      if (!taskMap[stepSlug]) {
        taskMap[stepSlug] = [];
      }
      
      // Add task to the appropriate group
      taskMap[stepSlug].push(task);
    });
    
    // Create a stable sorting function that will produce consistent results
    // instead of relying on Array.sort() which can be unstable
    for (const [slug, tasks] of Object.entries(taskMap)) {
      // First create a stable sort by task_index (which should never change)
      // Use a stable sort implementation to avoid UI jumpiness
      const stableSortedTasks = [...tasks].sort((a, b) => {
        // Primary sort by task_index
        const indexDiff = (a.task_index || 0) - (b.task_index || 0);
        if (indexDiff !== 0) return indexDiff;
        
        // Secondary sort by attempts_count (descending)
        const attemptsDiff = (b.attempts_count || 0) - (a.attempts_count || 0);
        if (attemptsDiff !== 0) return attemptsDiff;
        
        // Tertiary sort by status to ensure consistent ordering
        // completed tasks first, then started, then created, then failed
        const getStatusPriority = (status: string) => {
          switch (status) {
            case 'completed': return 0;
            case 'started': return 1;
            case 'created': return 2;
            case 'failed': return 3;
            default: return 4;
          }
        };
        return getStatusPriority(a.status) - getStatusPriority(b.status);
      });
      
      // Replace the tasks array with the stably sorted one
      taskMap[slug] = stableSortedTasks;
    }
    
    return taskMap;
  }, [runData?.step_tasks]);
  
  // Get ordered step tasks for a specific step - memoize this too for stability
  const getOrderedStepTasks = useMemo(() => {
    // Return a function that uses the memoized tasksByStepSlug
    return (stepSlug: string): any[] => {
      return tasksByStepSlug[stepSlug] || [];
    };
  }, [tasksByStepSlug]);

  // Basic run state
  const isCompleted = runData?.status === 'completed';
  const isFailed = runData?.status === 'failed';
  const isRunning = runData?.status === 'started';
  const showSteps = runData && (isRunning || isCompleted || isFailed);

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
  const analysisData: AnalysisData = useMemo(() => {
    logger.log('=== Analysis Summary Called ===');
    logger.log('isCompleted:', isCompleted);

    // Return empty state if no data is available
    if (!runData?.step_tasks || runData.step_tasks.length === 0) {
      logger.log('No step tasks found in runData');
      return { summary: '', tags: [], dataReady: false };
    }
    
    // Check if both tags and summary tasks are completed
    const tagTask = runData.step_tasks.find(
      task => task.step_slug === 'tags' && task.status === 'completed'
    );
    const summaryTask = runData.step_tasks.find(
      task => task.step_slug === 'summary' && task.status === 'completed'
    );
    
    // Only consider data ready when both are available
    const dataReady = !!tagTask && !!summaryTask;

    try {
      // Find the step tasks by their step_slug using our ordered function
      const summaryTasks = getOrderedStepTasks('summary');
      const tagsTasks = getOrderedStepTasks('tags');

      // Get the completed tasks - take the first completed one in order
      const summaryTask = summaryTasks.find(task => task.status === 'completed');
      const tagsTask = tagsTasks.find(task => task.status === 'completed');

      // Extract summary
      let summary = '';
      if (summaryTask?.output) {
        logger.log('Found completed summary task');
        
        try {
          // Handle different data formats consistently
          if (typeof summaryTask.output === 'string') {
            // If it's already a string, use it directly
            summary = summaryTask.output;
          } else if (summaryTask.output && typeof summaryTask.output === 'object') {
            // If it's an object, try to find a summary property or stringify it
            const anyOutput = summaryTask.output as any;
            if (typeof anyOutput.summary === 'string') {
              summary = anyOutput.summary;
            } else if (typeof anyOutput.text === 'string') {
              summary = anyOutput.text;
            } else {
              // Last resort: convert object to string
              summary = JSON.stringify(summaryTask.output);
            }
          }
        } catch (e) {
          logger.error('Error parsing summary output:', e);
          summary = 'Error parsing summary data';
        }
      }

      // Extract tags with improved consistency
      let tags: string[] = [];
      if (tagsTask?.output) {
        logger.log('Found completed tags task');
        
        try {
          // Special handling for tag arrays to ensure consistent format
          if (Array.isArray(tagsTask.output)) {
            // Direct array output - filter to ensure all elements are strings
            tags = tagsTask.output
              .filter(tag => typeof tag === 'string')
              .map(tag => tag.trim())
              .filter(tag => tag.length > 0);
          } else if (typeof tagsTask.output === 'string') {
            // Try to parse JSON first
            try {
              const parsedOutput = JSON.parse(tagsTask.output);
              if (Array.isArray(parsedOutput)) {
                tags = parsedOutput
                  .filter(tag => typeof tag === 'string')
                  .map(tag => tag.trim())
                  .filter(tag => tag.length > 0);
              } else {
                // If not an array, fall back to comma splitting
                tags = tagsTask.output
                  .split(',')
                  .map(t => t.trim())
                  .filter(tag => tag.length > 0);
              }
            } catch {
              // If parsing fails, just split by commas
              tags = tagsTask.output
                .split(',')
                .map(t => t.trim())
                .filter(tag => tag.length > 0);
            }
          } else if (tagsTask.output && typeof tagsTask.output === 'object') {
            // Handle object with tags property
            const anyOutput = tagsTask.output as any;
            if (Array.isArray(anyOutput.tags)) {
              tags = anyOutput.tags
                .filter(tag => typeof tag === 'string')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);
            }
          }
          
          // Remove duplicates from tags
          tags = [...new Set(tags)];
          
          // Sort tags alphabetically for consistent display
          tags.sort((a, b) => a.localeCompare(b));
        } catch (e) {
          logger.error('Error parsing tags output:', e);
          tags = [];
        }
      }

      // Return consistent object with sanitized data
      return { 
        summary: summary.trim(), 
        tags: tags,
        dataReady: dataReady
      };
    } catch (e) {
      logger.error('Error extracting data from step tasks:', e);
      return { summary: '', tags: [], dataReady: false };
    }
  }, [runData?.step_tasks, isCompleted, getOrderedStepTasks]);

  // ONLY show summary when both tags and summary tasks are ready
  // This is critical to preventing flickering
  const showSummary = runData && isCompleted && analysisData.dataReady;
  const showAnalyzeAnother = runData && (isCompleted || isFailed);

  // Keep analysis section expanded when running or failed, collapse only when completed successfully
  useEffect(() => {
    if (isRunning || isFailed) {
      setAnalysisExpanded(true);
    } else if (isCompleted) {
      setAnalysisExpanded(false);
    }
  }, [isRunning, isCompleted, isFailed, runData?.run_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      // Call the onAnalyzeWebsite callback with the URL
      await onAnalyzeWebsite(url.trim());

      // Clear the input field after submission
      setUrl('');
    }
  };

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
          analysisData={analysisData}
        />
      </Suspense>
    </div>
  );
}