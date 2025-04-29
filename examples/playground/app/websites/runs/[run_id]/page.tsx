'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FormMessage, Message } from '@/components/form-message';

import { Database } from '@/supabase/functions/database-types';

type RunRow = Database['pgflow']['Tables']['runs']['Row'];
type Json = Database['Json'];

function RenderJson(json: Json) {
  return (
    <pre className="p-4 bg-muted rounded-md overrun-auto text-sm">
      {JSON.stringify(json, null, 2)}
    </pre>
  );
}

export default function FlowRunPage() {
  const [runData, setRunData] = useState<RunRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const params = useParams();
  const runId = params.run_id as string;

  useEffect(() => {
    const fetchRunData = async () => {
      if (!runId) return;

      try {
        setLoading(true);

        // Fetch the flow run data
        const { data, error } = await supabase
          .schema('pgflow')
          .from('runs')
          .select('*')
          .eq('run_id', runId)
          .single<RunRow>();

        if (error) {
          setError(`Error fetching run data: ${error.message}`);
          return;
        }

        setRunData(data);
      } catch (err) {
        console.error('Error fetching flow run:', err);
        setError('An error occurred while fetching the flow run data');
      } finally {
        setLoading(false);
      }
    };

    fetchRunData();

    // Optional: Set up a subscription to get real-time updates
    // const subscription = supabase
    //   .channel(`flow_run_${runId}`)
    //   .on('postgres_changes', {
    //     event: 'UPDATE',
    //     schema: 'pgflow',
    //     table: 'runs',
    //     filter: `run_id=eq.${runId}`
    //   }, (payload) => {
    //     setRunData(payload.new);
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
            <p className="text-foreground/60">Loading run data...</p>
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
          <h2 className="text-2xl font-medium mb-4">
            {runData.flow_slug}: {runId}
          </h2>

          {runData ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Status</h3>
                <div className="flex items-center">
                  <span
                    className={`inline-block w-3 h-3 rounded-full mr-2 ${
                      runData.status === 'completed'
                        ? 'bg-green-500'
                        : runData.status === 'started'
                          ? 'bg-blue-500'
                          : runData.status === 'failed'
                            ? 'bg-red-500'
                            : 'bg-yellow-500'
                    }`}
                  ></span>
                  <span className="capitalize">
                    {runData.status || 'unknown'}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">Run Information</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <dt className="text-sm text-foreground/60">Run input</dt>
                    <dd>
                      <RenderJson json={runData.input} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-foreground/60">Flow</dt>
                    <dd>{runData.flow_slug}</dd>
                    <dt className="text-sm text-foreground/60">
                      Remaining steps
                    </dt>
                    <dd>{runData.remaining_steps}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">Run Output</h3>
                {runData.status === 'completed' ? (
                  <RenderJson json={runData.output} />
                ) : (
                  <p className="text-muted-foreground">
                    Run is not completed yet - no output available
                  </p>
                )}
              </div>
            </div>
          ) : (
            <FormMessage
              message={{ message: 'No run data found for this run ID' }}
            />
          )}

          <div className="mt-8">
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                View Raw Data
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded-md text-xs overrun-auto">
                {JSON.stringify(runData, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
