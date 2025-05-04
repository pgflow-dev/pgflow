'use client';

import { useEffect, useState } from 'react';
import { ResultRow } from '@/lib/db';

interface FlowDagVisualizationProps {
  runData: ResultRow | null;
  className?: string;
}

// This approach uses dynamic imports to avoid SSR issues with ReactFlow
export default function FlowDagVisualization({
  runData,
  className = '',
}: FlowDagVisualizationProps) {
  const [showGraph, setShowGraph] = useState(true);
  const [ClientDiagram, setClientDiagram] = useState<React.ComponentType<{ runData: ResultRow }> | null>(null);

  // Dynamically import the client-side only component
  useEffect(() => {
    import('./flow-dag-client').then((module) => {
      setClientDiagram(() => module.default);
    });
  }, []);

  if (!runData) {
    return null;
  }

  return (
    <div className={`${className} border rounded-lg overflow-hidden h-full`}>
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="text-xs text-muted-foreground">
          <div className="flex items-center space-x-2">
            <div className="flex items-center">
              <div className="h-2 w-2 bg-green-500 rounded-full mr-1"></div>
              <span>Completed</span>
            </div>
            <div className="flex items-center">
              <div className="h-2 w-2 bg-yellow-500 rounded-full mr-1"></div>
              <span>Running</span>
            </div>
            <div className="flex items-center">
              <div className="h-2 w-2 bg-red-500 rounded-full mr-1"></div>
              <span>Failed</span>
            </div>
            <div className="flex items-center">
              <div className="h-2 w-2 bg-blue-500 rounded-full mr-1"></div>
              <span>Waiting</span>
            </div>
          </div>
        </div>
        <button
          className="text-xs px-2 py-0.5 rounded hover:bg-muted border"
          onClick={() => setShowGraph(!showGraph)}
        >
          {showGraph ? 'Hide' : 'Show'}
        </button>
      </div>
      
      {showGraph && ClientDiagram && (
        <div className="h-[calc(100%-30px)] bg-background">
          <ClientDiagram runData={runData} />
        </div>
      )}
      
      {showGraph && !ClientDiagram && (
        <div className="h-[calc(100%-30px)] flex items-center justify-center bg-background">
          <div className="flex flex-col items-center">
            <div className="h-8 w-8 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-2"></div>
            <p className="text-xs text-foreground/60">Loading diagram...</p>
          </div>
        </div>
      )}
    </div>
  );
}