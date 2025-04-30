'use client';

import { useState, useEffect } from 'react';
import { ResultRow, StepStateRow } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [stepsExpanded, setStepsExpanded] = useState(true);

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
  const showSummary = runData && isCompleted;
  const showAnalyzeAnother = runData && (isCompleted || isFailed);
  
  // Auto-collapse steps when flow completes
  useEffect(() => {
    if (isCompleted) {
      setStepsExpanded(false);
    }
  }, [isCompleted]);

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

  // Get analysis summary from output
  const getAnalysisSummary = (): { summary: string; sentiment: string } => {
    if (!runData?.output) return { summary: '', sentiment: 'neutral' };

    try {
      const output = runData.output;

      if (typeof output === 'object' && output !== null) {
        // Check for the new structure with saveToDb
        if (output.saveToDb && typeof output.saveToDb === 'object') {
          const { summary = '', sentiment = 0 } = output.saveToDb;

          // Convert numerical sentiment to string category
          let sentimentCategory = 'neutral';
          if (typeof sentiment === 'number') {
            if (sentiment > 0.2) sentimentCategory = 'positive';
            else if (sentiment < -0.2) sentimentCategory = 'negative';
          }

          return {
            summary:
              typeof summary === 'string' ? summary : JSON.stringify(summary),
            sentiment: sentimentCategory,
          };
        }

        // Fallback to old structure for backward compatibility
        const summary = output.summary || '';
        const sentiment = output.sentiment || 'neutral';

        return {
          summary:
            typeof summary === 'string' ? summary : JSON.stringify(summary),
          sentiment: typeof sentiment === 'string' ? sentiment : 'neutral',
        };
      }
    } catch (e) {
      console.error('Error parsing output:', e);
    }

    return { summary: '', sentiment: 'neutral' };
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

  const { summary, sentiment } = getAnalysisSummary();
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
      <h2 className="text-2xl font-medium mb-6">User-facing UI</h2>

      <AnimatePresence>
        {/* Initial URL input form */}
        {!showSteps && (
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

        {/* Step-by-step process */}
        {showSteps && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
            <div className="p-3 bg-muted rounded-md">
              <p className="font-medium">{websiteUrl}</p>
            </div>

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Process Steps</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStepsExpanded(!stepsExpanded)}
                className="flex items-center gap-1"
              >
                {stepsExpanded ? (
                  <>
                    <span className="text-sm">Collapse</span>
                    <ChevronUp className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <span className="text-sm">Expand</span>
                    <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            <AnimatePresence>
              {stepsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8 overflow-hidden"
                >
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
            className="mt-12 space-y-6"
          >
            <div className="border-t pt-8">
              <h3 className="text-xl font-medium mb-6">Analysis Results</h3>

              <div className="mb-4">
                <span className="text-sm font-medium text-muted-foreground">
                  Website:
                </span>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-primary hover:underline"
                >
                  {websiteUrl}
                </a>
              </div>

              <dl className="mt-6 space-y-6">
                <div className="flex flex-col space-y-2">
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
          </motion.div>
        )}

        {/* Analyze another website */}
        {showAnalyzeAnother && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 pt-6 border-t"
          >
            <h3 className="text-lg font-medium mb-4">
              Analyze Another Website
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  id="url-new"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  className="w-full"
                  disabled={analyzeLoading}
                />
              </div>
              <Button type="submit" disabled={analyzeLoading}>
                {analyzeLoading ? 'Starting Analysis...' : 'Analyze Website'}
              </Button>
              {analyzeError && (
                <div className="text-sm text-destructive">{analyzeError}</div>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
