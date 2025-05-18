'use client';

import React, { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
// Fix #1: Create ONE lazy component outside render
// Use a regular import instead of lazy loading to ensure component stability
import AnalysisResult from './analysis-result';

// Define analysis data type
interface AnalysisData {
  summary: string;
  tags: string[];
  dataReady: boolean;
}

interface MotionComponentsProps {
  websiteUrl: string;
  getOrderedStepStates: any[];
  getOrderedStepTasks: (stepSlug: string) => any[];
  analysisExpanded: boolean;
  setAnalysisExpanded: (value: boolean) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  url: string;
  setUrl: (value: string) => void;
  loading: boolean;
  analyzeLoading: boolean;
  onAnalyzeWebsite: (url: string) => Promise<void>;
  exampleLinks: any[];
  showSteps: boolean;
  showSummary: boolean;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  analysisData: AnalysisData;
}

export default function MotionComponents({
  websiteUrl,
  getOrderedStepStates,
  getOrderedStepTasks,
  analysisExpanded,
  setAnalysisExpanded,
  handleSubmit,
  url,
  setUrl,
  loading,
  analyzeLoading,
  onAnalyzeWebsite,
  exampleLinks,
  showSteps,
  showSummary,
  isRunning,
  isCompleted,
  isFailed,
  analysisData
}: MotionComponentsProps) {
  return (
    <AnimatePresence>
      {/* Initial URL input form - only show when no analysis is running or completed */}
      {!showSteps && !showSummary && (
        <motion.div
          key="initial-form"
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
                  className={`${
                    link.variant === 'success'
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
          key="steps-progress"
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
                key="step-details"
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
                {/* Use a stable list with a layoutId for each element to prevent flickering */}
                <div className="space-y-6">
                  {/* Optional polish: Turn off exit animations for step rows */}
                  <AnimatePresence initial={false} exitBeforeEnter={false}>
                    {getOrderedStepStates.map((step, index) => {
                      // Pre-compute all the conditional values outside of the JSX to ensure stability
                      // Fix #2: Use stable key based only on step_slug (without index)
                      const stepKey = step.step_slug;
                      const stepSlug = step.step_slug;
                      const stepDisplayName = step.step_slug.replace(/_/g, ' ');
                      const stepNumber = index + 1;
                    
                    // Determine status classes once
                    const statusClass = step.status === 'completed' 
                      ? 'bg-green-500 border-green-500 text-white'
                      : step.status === 'failed'
                        ? 'border-red-500 text-red-500'
                        : step.status === 'started'
                          ? 'border-yellow-500 text-yellow-500'
                          : 'border-gray-300 text-gray-300';
                          
                    // Determine the status display text once
                    const statusText = step.status === 'completed' ? 'Completed' :
                                      step.status === 'failed' ? 'Failed' :
                                      step.status === 'started' ? 'In progress' :
                                      'Waiting';
                                      
                    // Determine opacity class once
                    const opacityClass = isCompleted && step.status === 'completed'
                      ? 'opacity-80'
                      : step.status === 'created'
                        ? 'opacity-50'
                        : '';
                    
                    // Determine if we have a failed task with an error message
                    const orderedStepTasks = getOrderedStepTasks(stepSlug);
                    const failedTask = orderedStepTasks.find(
                      (task) => task.status === 'failed' && task.error_message
                    );
                    const errorMessage = failedTask?.error_message || null;
                    
                    return (
                      <motion.div
                        key={stepKey}
                        // Use layoutId for framer-motion to maintain continuity
                        layoutId={stepKey}
                        // Use simpler animation to reduce jitter
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        // Use a consistent transition for all steps
                        transition={{ duration: 0.3 }}
                        className={`flex items-start space-x-4 ${opacityClass}`}
                      >
                        <div className="flex-shrink-0 mt-1">
                          <div
                            className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${statusClass}`}
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
                              <span>{stepNumber}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-medium capitalize">
                            {stepDisplayName}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {statusText}
                          </p>
                          {errorMessage && (
                            <div className="mt-2 overflow-auto">
                              <div className="max-h-40 overflow-hidden border border-red-500/30 rounded-md">
                                <div className="overflow-auto max-h-40">
                                  <pre className="bg-red-500/5 rounded-md p-4 text-xs text-white whitespace-pre-wrap">
                                    {errorMessage}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Summary view - simplified with stable component */}
      <AnimatePresence>
        {showSummary && (
          <motion.div
            key="summary-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6 mt-8"
          >
            {/* Fix #1: Direct component usage with no suspense or lazy loading */}
            <AnalysisResult 
              summary={analysisData.summary} 
              tags={analysisData.tags} 
              websiteUrl={websiteUrl} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}