'use client';

import React, { useState, useEffect } from 'react';
import type { FlowRun } from '@pgflow/client';
import type { AnyFlow } from '@pgflow/dsl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface WebsiteAnalysisUIProps {
  flowRun: FlowRun<AnyFlow> | null;
  loading: boolean;
  error: string | null;
}

export default function WebsiteAnalysisUI({
  flowRun,
  loading,
  error,
}: WebsiteAnalysisUIProps) {
  const [analysisExpanded, setAnalysisExpanded] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!flowRun) return;

    const unsubscribes: (() => void)[] = [];

    // Subscribe to flow run events
    unsubscribes.push(
      flowRun.on('*', (event) => {
        setRefresh(prev => prev + 1);
      })
    );

    // Subscribe to step events for the steps we care about
    const stepSlugs = ['website', 'summary', 'tags', 'saveToDb'];
    for (const stepSlug of stepSlugs) {
      const step = flowRun.step(stepSlug);
      unsubscribes.push(
        step.on('*', (event) => {
          setRefresh(prev => prev + 1);
        })
      );
    }

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [flowRun]);

  // Get the input URL from the run
  const analyzedUrl = flowRun?.input?.url || '';

  // Check if analysis is complete
  const isAnalysisComplete = flowRun?.status === 'completed';

  // Get summary and tags from step outputs
  // We'll need to access these through the step() method
  const summaryStep = flowRun?.step('summary');
  const tagsStep = flowRun?.step('tags');
  
  // The summary step returns a string directly
  const summary = typeof summaryStep?.output === 'string' ? summaryStep.output : null;
  // The tags step returns an array of strings directly
  const tags = Array.isArray(tagsStep?.output) ? tagsStep.output : [];


  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">Error: {String(error)}</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Website Analyzer</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Analyze any website using AI to extract key information, generate summaries, and identify relevant tags.
        </p>
      </div>


      {/* Analysis Results */}
      {flowRun && (
        <div className="max-w-4xl mx-auto">
          <Collapsible open={analysisExpanded} onOpenChange={setAnalysisExpanded}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-4 h-auto"
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Analysis Results</h2>
                  {analyzedUrl && (
                    <span className="text-sm text-muted-foreground">
                      for {analyzedUrl}
                    </span>
                  )}
                </div>
                {analysisExpanded ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <AnimatePresence>
                {analysisExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 space-y-6"
                  >
                    {/* Progress Steps */}
                    <div className="space-y-3">
                      {['website', 'summary', 'tags', 'saveToDb'].map((stepSlug) => {
                        const step = flowRun.step(stepSlug);
                        const displayName = stepSlug === 'saveToDb' ? 'Save to Database' : stepSlug;
                        const stepStatus = step?.status || 'pending';
                        return (
                          <div
                            key={stepSlug}
                            className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                          >
                            <span className="font-medium capitalize">
                              {displayName.replace(/_/g, ' ')}
                            </span>
                            <Badge
                              variant={
                                stepStatus === 'completed' ? 'default' :
                                stepStatus === 'failed' ? 'destructive' :
                                stepStatus === 'started' ? 'secondary' :
                                'outline'
                              }
                            >
                              {stepStatus}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary Section */}
                    {isAnalysisComplete && summary && (
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold">Summary</h3>
                        <p className="text-muted-foreground leading-relaxed">
                          {String(summary)}
                        </p>
                      </div>
                    )}

                    {/* Tags Section */}
                    {isAnalysisComplete && tags.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold">Tags</h3>
                        <div className="flex flex-wrap gap-2">
                          {tags.map((tag: string, index: number) => (
                            <Badge key={index} variant="secondary">
                              {String(tag)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status Message */}
                    {!isAnalysisComplete && (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">
                          Analysis in progress... This may take a few moments.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

// Helper component for collapsible sections
function Collapsible({ 
  children, 
  open, 
  onOpenChange 
}: { 
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          if (child.type === CollapsibleTrigger) {
            return React.cloneElement(child as any, {
              onClick: () => onOpenChange(!open)
            });
          }
          if (child.type === CollapsibleContent) {
            return open ? child : null;
          }
        }
        return child;
      })}
    </div>
  );
}

function CollapsibleTrigger({ 
  children, 
  asChild, 
  onClick 
}: { 
  children: React.ReactNode;
  asChild?: boolean;
  onClick?: () => void;
}) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as any, { onClick });
  }
  return <div onClick={onClick}>{children}</div>;
}

function CollapsibleContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}