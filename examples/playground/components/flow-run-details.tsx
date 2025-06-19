'use client';

import { useEffect, useState } from 'react';
import type { FlowRun } from '@pgflow/client';
import type { AnyFlow } from '@pgflow/dsl';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import JSONHighlighter from '@/components/json-highlighter';
import { FormMessage } from '@/components/form-message';
import { useElapsedTime } from '@/lib/hooks/use-elapsed-time';

// Format time difference in a concise way (e.g., "5s", "3m 45s", "2h 15m")
function formatTimeDifference(
  startDate: Date | null,
  endDate: Date | null,
): string {
  if (!startDate) return '';

  const start = startDate;
  const end = endDate || new Date();

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


interface FlowRunDetailsProps {
  runId: string;
  flowRun: FlowRun<AnyFlow> | null;
  loading: boolean;
  error: string | null;
}

export default function FlowRunDetails({
  runId,
  flowRun,
  loading,
  error,
}: FlowRunDetailsProps) {
  const [refresh, setRefresh] = useState(0);
  const elapsedTimeRef = useElapsedTime(flowRun?.started_at || null);

  useEffect(() => {
    if (!flowRun) return;

    // Subscribe to all run events to trigger re-renders
    const unsubscribeRun = flowRun.on('*', () => {
      setRefresh(prev => prev + 1);
    });

    return () => {
      unsubscribeRun();
    };
  }, [flowRun]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <div className="text-sm text-muted-foreground">Loading flow run...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <FormMessage message={{ error }} />
      </div>
    );
  }

  if (!flowRun) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <div className="text-sm text-muted-foreground">No flow run found</div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-[30vh] h-full overflow-y-auto">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-3">Technical Details</h2>
          
          {/* Run Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Run ID:</span>
              <span className="font-mono text-xs">{runId}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span className={`font-medium ${
                flowRun.status === 'completed' ? 'text-green-600' :
                flowRun.status === 'failed' ? 'text-red-600' :
                flowRun.status === 'started' ? 'text-blue-600' :
                'text-yellow-600'
              }`}>
                {flowRun.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Remaining Steps:</span>
              <span>{flowRun.remaining_steps}</span>
            </div>
            {flowRun.started_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Started:</span>
                <span ref={elapsedTimeRef}></span>
              </div>
            )}
            {flowRun.completed_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Duration:</span>
                <span>{formatTimeDifference(flowRun.started_at, flowRun.completed_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Flow Input/Output */}
        {flowRun.input && (
          <Collapsible>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="font-medium text-sm">Flow Input</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3">
                <div className="bg-muted/20 rounded p-2 overflow-x-auto">
                  <JSONHighlighter data={flowRun.input} />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {flowRun.output && (
          <Collapsible>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="font-medium text-sm">Flow Output</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3">
                <div className="bg-muted/20 rounded p-2 overflow-x-auto">
                  <JSONHighlighter data={flowRun.output} />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}