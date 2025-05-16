// lib/services/start-analysis.ts
import { createClient } from '@/utils/supabase/client'; // will be swapped for pgflow later

// What we will need soon
// import { PgflowClient } from '@pgflow/client';
// const pgflow = new PgflowClient(supabase);

export interface StartAnalysisOptions {
  /**
   * If true, throws an AuthRequiredError when the user is not logged in.
   * If false, function continues but you can handle unauthenticated state yourself.
   */
  requireAuth?: boolean;
  /**
   * Predetermined run id (useful for optimistic UI / testing).
   */
  runId?: string;
}

/**
 * Starts analyse-website pgflow run and returns the run_id.
 * **This is the ONLY place that knows HOW we start a flow.**
 */
export async function startWebsiteAnalysis(
  url: string,
  { requireAuth = true, runId }: StartAnalysisOptions = {},
): Promise<string> {
  if (!url) throw new Error('URL is required');

  const supabase = createClient();

  // optional auth guard
  if (requireAuth) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const err = new Error('AUTH_REQUIRED');
      // tiny custom error class makes catching easier
      (err as any).code = 'AUTH_REQUIRED';
      throw err;
    }
  }

  // when pgflow client is ready, replace the RPC:
  //
  // const pgflowRun = await pgflow.startFlow<typeof AnalyzeWebsite>(
  //   'analyze_website',
  //   { url },
  //   runId ? { runId } : undefined
  // );
  // return pgflowRun.run_id;

  // --- current "RPC then redirect" behaviour ---
  const { data, error } = await supabase.rpc(
    'start_analyze_website_flow',
    { url },
  );

  if (error || !data?.run_id) {
    throw new Error(
      error?.message ?? 'start_analyze_website_flow returned no run_id',
    );
  }

  return data.run_id as string;
}