import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import { Database } from '@/supabase/functions/database-types';

type RunRow = Database['pgflow']['Tables']['runs']['Row'];

export default async function RunsListPage() {
  // Server-side data fetching
  const supabase = await createClient();
  const { data: runs, error } = await supabase
    .schema('pgflow')
    .from('runs')
    .select('*')
    .order('started_at', { ascending: false }); // Add sorting by most recent first

  // Modified error handling for server component
  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-lg">
          <h2 className="text-xl font-medium text-destructive mb-2">Error</h2>
          <p className="text-destructive/80">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Website Analysis Runs</h1>

      {!runs || runs.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground mb-4">No runs found</p>
          <Link
            href="/"
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
                  <h2 className="text-lg font-medium">{run.flow_slug}</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center">
                  <span
                    className={`inline-block w-3 h-3 rounded-full mr-2 ${
                      run.status === 'completed'
                        ? 'bg-green-500'
                        : run.status === 'running' || run.status === 'started'
                          ? 'bg-blue-500'
                          : run.status === 'error' || run.status === 'failed'
                            ? 'bg-red-500'
                            : 'bg-yellow-500'
                    }`}
                  ></span>
                  <span className="capitalize text-sm">
                    {(run.status === 'started' ? 'running' : run.status) || 'unknown'}
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
