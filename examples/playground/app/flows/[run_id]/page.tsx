'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FormMessage, Message } from '@/components/form-message';

export default function FlowRunPage() {
  const [flowData, setFlowData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const params = useParams();
  const runId = params.run_id as string;

  useEffect(() => {
    const fetchFlowData = async () => {
      if (!runId) return;
      
      try {
        setLoading(true);
        
        // In a real implementation, you would fetch the flow run data
        // This is a placeholder - replace with actual data fetching
        const { data, error } = await supabase
          .from('pgflow_runs')
          .select('*')
          .eq('id', runId)
          .single();
        
        if (error) {
          setError(`Error fetching flow data: ${error.message}`);
          return;
        }
        
        setFlowData(data);
      } catch (err) {
        console.error('Error fetching flow run:', err);
        setError('An error occurred while fetching the flow data');
      } finally {
        setLoading(false);
      }
    };

    fetchFlowData();
    
    // Optional: Set up a subscription to get real-time updates
    // const subscription = supabase
    //   .channel(`flow_run_${runId}`)
    //   .on('postgres_changes', { 
    //     event: 'UPDATE', 
    //     schema: 'public', 
    //     table: 'pgflow_runs',
    //     filter: `id=eq.${runId}` 
    //   }, (payload) => {
    //     setFlowData(payload.new);
    //   })
    //   .subscribe();
    
    // return () => {
    //   subscription.unsubscribe();
    // };
  }, [runId, supabase]);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="flex flex-col items-center">
            <div className="h-12 w-12 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-4"></div>
            <p className="text-foreground/60">Loading flow data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-lg">
          <h2 className="text-xl font-medium text-destructive mb-2">Error</h2>
          <p className="text-destructive/80">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Flow Run Details</h1>
      
      <div className="grid grid-cols-1 gap-8">
        <div className="p-6 border rounded-lg shadow-sm">
          <h2 className="text-2xl font-medium mb-4">Run ID: {runId}</h2>
          
          {flowData ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Status</h3>
                <div className="flex items-center">
                  <span className={`inline-block w-3 h-3 rounded-full mr-2 ${
                    flowData.status === 'completed' ? 'bg-green-500' :
                    flowData.status === 'running' ? 'bg-blue-500' :
                    flowData.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                  }`}></span>
                  <span className="capitalize">{flowData.status || 'unknown'}</span>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">Flow Information</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <dt className="text-sm text-foreground/60">Flow Name</dt>
                    <dd>{flowData.flow_name || 'analyze_website'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-foreground/60">Started At</dt>
                    <dd>{flowData.created_at ? new Date(flowData.created_at).toLocaleString() : 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-foreground/60">Last Updated</dt>
                    <dd>{flowData.updated_at ? new Date(flowData.updated_at).toLocaleString() : 'N/A'}</dd>
                  </div>
                </dl>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">Results</h3>
                {flowData.result ? (
                  <pre className="p-4 bg-muted rounded-md overflow-auto text-sm">{
                    typeof flowData.result === 'object' 
                      ? JSON.stringify(flowData.result, null, 2) 
                      : flowData.result
                  }</pre>
                ) : (
                  <p className="text-muted-foreground">No results available yet</p>
                )}
              </div>
            </div>
          ) : (
            <FormMessage message={{ message: "No flow data found for this run ID" }} />
          )}
          
          <div className="mt-8">
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">View Raw Data</summary>
              <pre className="mt-2 p-2 bg-muted rounded-md text-xs overflow-auto">{JSON.stringify(flowData, null, 2)}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}