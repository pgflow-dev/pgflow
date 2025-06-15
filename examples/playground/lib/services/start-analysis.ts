// lib/services/start-analysis.ts
import { createClient } from '@/utils/supabase/client';
import { getPgflowClient } from '@/lib/pgflow-client';

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

  // Get the user ID for the flow input
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  // Use pgflow client to start the flow
  const pgflow = getPgflowClient();
  const flowRun = await pgflow.startFlow(
    'analyze_website',
    { url, user_id: userId },
    runId
  );
  
  return flowRun.run_id;
}