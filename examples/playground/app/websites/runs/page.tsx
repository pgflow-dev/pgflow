'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Database } from '@/supabase/functions/database-types';

type RunRow = Database['pgflow']['Tables']['runs']['Row'];

export default function RunsListPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .schema('pgflow')
          .from('runs')
          .select('*');

        if (error) {
          setError(`Error fetching runs: ${error.message}`);
          return;
        }

        setRuns(data || []);
      } catch (err) {
        console.error('Error fetching runs:', err);
        setError('An error occurred while fetching runs');
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [supabase]);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="flex flex-col items-center">
            <div className="h-12 w-12 rounded-full border-t-2 border-b-2 border-primary animate-spin mb-4"></div>
            <p className="text-foreground/60">Loading runs...</p>
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
      <h1 className="text-3xl font-bold mb-6">Website Analysis Runs</h1>

      {runs.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground mb-4">No runs found</p>
          <Link
            href="/websites"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground"
          >
            Analyze a website
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {runs.map((run) => (
            <Link
              key={run.run_id}
              href={`/websites/runs/${run.run_id}`}
              className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">
                    {run.run_name || 'analyze_website'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(run.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center">
                  <span
                    className={`inline-block w-3 h-3 rounded-full mr-2 ${
                      run.status === 'completed'
                        ? 'bg-green-500'
                        : run.status === 'running'
                          ? 'bg-blue-500'
                          : run.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-yellow-500'
                    }`}
                  ></span>
                  <span className="capitalize text-sm">
                    {run.status || 'unknown'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
